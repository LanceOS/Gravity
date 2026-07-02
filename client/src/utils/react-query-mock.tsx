import React, { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo, useSyncExternalStore } from 'react';

export function keepPreviousData<T>(_data: T): T {
  return _data;
}

// --- Types ---

export type QueryKey = readonly unknown[];

type QueryState<T = any> = {
  data: T | undefined;
  error: any;
  status: 'pending' | 'success' | 'error';
  fetchStatus: 'fetching' | 'idle';
  updatedAt: number;
  promise: Promise<T> | null;
  fetchId: number;
  staleTime: number;
  gcTime: number;
  timerId: number | null; // For garbage collection
  subscribers: Set<() => void>;
};

type QueryFilters = {
  queryKey?: QueryKey;
  exact?: boolean;
};

// --- Helper Functions ---

function serializeKey(key: QueryKey): string {
  return JSON.stringify(key);
}

function isKeyMatch(queryKey: QueryKey, targetKey: QueryKey): boolean {
  if (queryKey.length < targetKey.length) return false;
  for (let i = 0; i < targetKey.length; i++) {
    const a = queryKey[i];
    const b = targetKey[i];
    if (typeof a === 'object' && a !== null && typeof b === 'object' && b !== null) {
      for (const key in b) {
        if ((a as any)[key] !== (b as any)[key]) return false;
      }
    } else if (a !== b) {
      return false;
    }
  }
  return true;
}

function isExactKeyMatch(queryKey: QueryKey, targetKey: QueryKey): boolean {
  return serializeKey(queryKey) === serializeKey(targetKey);
}

function matchesFilters(queryKey: QueryKey, filters?: QueryFilters): boolean {
  const targetKey = filters?.queryKey;
  if (!targetKey) return true;
  return filters?.exact ? isExactKeyMatch(queryKey, targetKey) : isKeyMatch(queryKey, targetKey);
}

// --- QueryClient ---

export class QueryClient {
  private cache = new Map<string, QueryState>();
  private defaultOptions: any;
  private globalSubscribers = new Set<() => void>();

  constructor(config: { defaultOptions?: any } = {}) {
    this.defaultOptions = config.defaultOptions || {};
  }

  public getOrCreateQuery<T>(key: QueryKey, options: any = {}): QueryState<T> {
    const serialized = serializeKey(key);
    if (!this.cache.has(serialized)) {
      const defaultStaleTime = this.defaultOptions.queries?.staleTime ?? 0;
      const defaultGcTime = this.defaultOptions.queries?.gcTime ?? 5 * 60 * 1000;

      const state: QueryState<T> = {
        data: undefined,
        error: null,
        status: 'pending',
        fetchStatus: 'idle',
        updatedAt: 0,
        promise: null,
        fetchId: 0,
        staleTime: options.staleTime ?? defaultStaleTime,
        gcTime: options.gcTime ?? defaultGcTime,
        timerId: null,
        subscribers: new Set(),
      };
      this.cache.set(serialized, state);
    }

    const state = this.cache.get(serialized)!;
    
    if (state.timerId !== null) {
      window.clearTimeout(state.timerId);
      state.timerId = null;
    }

    return state as QueryState<T>;
  }

  public updateQueryState<T>(key: QueryKey, updater: (state: QueryState<T>) => Partial<QueryState<T>>) {
    const serialized = serializeKey(key);
    const state = this.cache.get(serialized) as QueryState<T> | undefined;
    if (state) {
      const updates = updater(state);
      const nextState = {
        ...state,
        ...updates,
      };
      this.cache.set(serialized, nextState);
      this.notify(key);
      this.notifyAll();
    }
  }

  public getQueryData<T>(key: QueryKey): T | undefined {
    const serialized = serializeKey(key);
    return this.cache.get(serialized)?.data as T | undefined;
  }

  public getQueriesData<T>(filters?: QueryFilters): Array<[QueryKey, T | undefined]> {
    const results: Array<[QueryKey, T | undefined]> = [];

    for (const [serialized, state] of this.cache.entries()) {
      const queryKey = JSON.parse(serialized) as QueryKey;
      if (matchesFilters(queryKey, filters)) {
        results.push([queryKey, state.data as T | undefined]);
      }
    }

    return results;
  }

  public setQueryData<T>(key: QueryKey, updater: T | ((old: T | undefined) => T)): T {
    const state = this.getOrCreateQuery<T>(key);
    const oldData = state.data;
    const newData = typeof updater === 'function' ? (updater as Function)(oldData) : updater;

    this.updateQueryState<T>(key, (prev) => ({
      ...prev,
      data: newData,
      status: 'success',
      updatedAt: Date.now(),
    }));
    return newData;
  }

  public invalidateQueries(filters?: QueryFilters) {
    for (const [serialized, state] of this.cache.entries()) {
      const queryKey = JSON.parse(serialized) as QueryKey;
      if (matchesFilters(queryKey, filters)) {
        this.updateQueryState(queryKey, () => ({
          updatedAt: 0,
        }));
      }
    }
  }

  public cancelQueries(filters?: QueryFilters): Promise<void> {
    for (const [serialized] of this.cache.entries()) {
      const queryKey = JSON.parse(serialized) as QueryKey;
      if (matchesFilters(queryKey, filters)) {
        this.updateQueryState(queryKey, (state) => ({
          promise: null,
          fetchStatus: 'idle',
          fetchId: state.fetchId + 1,
        }));
      }
    }

    return Promise.resolve();
  }

  public removeQueries(filters?: QueryFilters) {
    for (const [serialized, state] of this.cache.entries()) {
      const queryKey = JSON.parse(serialized) as QueryKey;
      if (matchesFilters(queryKey, filters)) {
        this.cache.delete(serialized);
        state.subscribers.forEach(cb => cb());
      }
    }
    this.notifyAll();
  }

  public notify(key: QueryKey) {
    const serialized = serializeKey(key);
    const state = this.cache.get(serialized);
    if (state) {
      state.subscribers.forEach(cb => cb());
    }
  }

  public subscribeAll(callback: () => void) {
    this.globalSubscribers.add(callback);
    return () => {
      this.globalSubscribers.delete(callback);
    };
  }

  public getIsFetching(filters?: QueryFilters): number {
    let count = 0;
    for (const [serialized, state] of this.cache.entries()) {
      const queryKey = JSON.parse(serialized) as QueryKey;
      if (matchesFilters(queryKey, filters) && state.fetchStatus === 'fetching') {
        count += 1;
      }
    }
    return count;
  }

  private notifyAll() {
    this.globalSubscribers.forEach(cb => cb());
  }

  public scheduleGc(key: QueryKey) {
    const serialized = serializeKey(key);
    const state = this.cache.get(serialized);
    if (state && state.subscribers.size === 0) {
      if (state.timerId !== null) {
        window.clearTimeout(state.timerId);
      }
      state.timerId = window.setTimeout(() => {
        this.cache.delete(serialized);
      }, state.gcTime);
    }
  }

  public subscribe(key: QueryKey, callback: () => void) {
    const state = this.getOrCreateQuery(key);
    state.subscribers.add(callback);
    return () => {
      state.subscribers.delete(callback);
      this.scheduleGc(key);
    };
  }

  public fetchQuery<T>(key: QueryKey, queryFn: () => Promise<T>, options: any = {}): Promise<T> {
    const state = this.getOrCreateQuery<T>(key, options);

    if (state.promise) {
      return state.promise;
    }

    const fetchId = state.fetchId + 1;

    this.updateQueryState<T>(key, () => ({
      fetchStatus: 'fetching',
      fetchId,
    }));

    const promise = queryFn()
      .then(data => {
        const latestState = this.cache.get(serializeKey(key));
        if (latestState?.fetchId !== fetchId) {
          return data;
        }

        this.updateQueryState<T>(key, (prev) => ({
          ...prev,
          data,
          status: 'success',
          fetchStatus: 'idle',
          updatedAt: Date.now(),
          promise: null,
        }));
        return data;
      })
      .catch(error => {
        const latestState = this.cache.get(serializeKey(key));
        if (latestState?.fetchId !== fetchId) {
          throw error;
        }

        this.updateQueryState<T>(key, (prev) => ({
          ...prev,
          error,
          status: 'error',
          fetchStatus: 'idle',
          updatedAt: Date.now(),
          promise: null,
        }));
        throw error;
      });

    this.updateQueryState<T>(key, (prev) => ({
      ...prev,
      promise,
    }));
    return promise;
  }

  public async prefetchQuery<T>(options: { queryKey: QueryKey; queryFn: () => Promise<T>; staleTime?: number; gcTime?: number }): Promise<void> {
    try {
      await this.fetchQuery(options.queryKey, options.queryFn, options);
    } catch (e) {
      // prefetchQuery ignores errors
    }
  }

  public clear() {
    this.cache.clear();
    this.notifyAll();
  }
}

// --- Context ---

const QueryClientContext = createContext<QueryClient | undefined>(undefined);

export const QueryClientProvider: React.FC<{ client: QueryClient; children: React.ReactNode }> = ({ client, children }) => {
  return <QueryClientContext.Provider value={client}>{children}</QueryClientContext.Provider>;
};

export function useQueryClient(): QueryClient {
  const client = useContext(QueryClientContext);
  if (!client) {
    throw new Error('useQueryClient must be used within a QueryClientProvider');
  }
  return client;
}

// --- useQuery Hook ---

interface UseQueryOptions<T> {
  queryKey: QueryKey;
  queryFn: () => Promise<T>;
  enabled?: boolean;
  staleTime?: number;
  gcTime?: number;
  retry?: boolean | number | ((failureCount: number, error: any) => boolean);
}

interface UseIsFetchingOptions {
  queryKey?: QueryKey;
  exact?: boolean;
}

export function useQuery<T>({ queryKey, queryFn, enabled = true, staleTime, gcTime }: UseQueryOptions<T>) {
  const client = useQueryClient();

  const stableQueryKey = useMemo(() => queryKey, [JSON.stringify(queryKey)]);

  const getSnapshot = useCallback(() => {
    return client.getOrCreateQuery<T>(stableQueryKey, { staleTime, gcTime });
  }, [client, stableQueryKey, staleTime, gcTime]);

  const state = useSyncExternalStore(
    useCallback(cb => client.subscribe(stableQueryKey, cb), [client, stableQueryKey]),
    getSnapshot,
    getSnapshot
  );

  const isStale = useMemo(() => {
    const sTime = staleTime ?? 0;
    if (sTime === Infinity) return false;
    // For staleTime === 0, it's always stale if we have data.
    return state.updatedAt ? Date.now() - state.updatedAt >= sTime : true;
  }, [state.updatedAt, staleTime]);

  const queryFnRef = useRef(queryFn);
  useEffect(() => {
    queryFnRef.current = queryFn;
  }, [queryFn]);

  const hasFetchedOnMount = useRef(false);

  const triggerFetch = useCallback(() => {
    client.fetchQuery<T>(stableQueryKey, queryFnRef.current, { staleTime, gcTime }).catch(console.error);
  }, [client, stableQueryKey, staleTime, gcTime]);

  useEffect(() => {
    hasFetchedOnMount.current = true;
    if (enabled && state.fetchStatus === 'idle') {
      const shouldFetch = state.status === 'pending' || isStale;
      if (shouldFetch) {
        triggerFetch();
      }
    }
  }, [enabled, stableQueryKey, isStale, triggerFetch]);

  return {
    data: state.data,
    error: state.error,
    isLoading: state.status === 'pending' && state.fetchStatus === 'fetching',
    isFetching: state.fetchStatus === 'fetching',
    isError: state.status === 'error',
    isSuccess: state.status === 'success',
    refetch: triggerFetch,
  };
}

interface UseQueriesOptions {
  queries: Array<{
    queryKey: QueryKey;
    queryFn?: () => Promise<any>;
    enabled?: boolean;
    staleTime?: number;
    gcTime?: number;
  }>;
}

export function useQueries({ queries }: UseQueriesOptions) {
  const client = useQueryClient();

  const serializedKeys = JSON.stringify(queries.map((q) => q.queryKey));
  const lastResultsRef = useRef<any[]>([]);

  const getSnapshot = useCallback(() => {
    const nextResults = queries.map((q) => {
      const queryState = client.getOrCreateQuery(q.queryKey, { staleTime: q.staleTime, gcTime: q.gcTime });
      return {
        data: queryState.data,
        error: queryState.error,
        isLoading: queryState.status === 'pending' && queryState.fetchStatus === 'fetching',
        isFetching: queryState.fetchStatus === 'fetching',
        isError: queryState.status === 'error',
        isSuccess: queryState.status === 'success',
      };
    });

    const isEquivalent =
      nextResults.length === lastResultsRef.current.length &&
      nextResults.every((res, idx) => {
        const prev = lastResultsRef.current[idx];
        if (!prev) return false;
        return (
          res.data === prev.data &&
          res.error === prev.error &&
          res.isLoading === prev.isLoading &&
          res.isFetching === prev.isFetching &&
          res.isError === prev.isError &&
          res.isSuccess === prev.isSuccess
        );
      });

    if (isEquivalent) {
      return lastResultsRef.current;
    }

    const resultsWithRefetch = nextResults.map((res, idx) => ({
      ...res,
      refetch: () => {
        const q = queries[idx];
        if (q && q.queryFn) {
          client.fetchQuery(q.queryKey, q.queryFn, { staleTime: q.staleTime, gcTime: q.gcTime }).catch(console.error);
        }
      },
    }));

    lastResultsRef.current = resultsWithRefetch;
    return resultsWithRefetch;
  }, [client, serializedKeys]);

  const subscribe = useCallback((callback: () => void) => {
    const unsubscribes = queries.map((q) => client.subscribe(q.queryKey, callback));
    return () => {
      unsubscribes.forEach((unsub) => unsub());
    };
  }, [client, serializedKeys]);

  const results = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getSnapshot
  );

  useEffect(() => {
    queries.forEach((q) => {
      const state = client.getOrCreateQuery(q.queryKey, { staleTime: q.staleTime, gcTime: q.gcTime });
      const enabled = q.enabled ?? true;
      const sTime = q.staleTime ?? 0;
      const isStale = sTime === Infinity ? false : (state.updatedAt ? Date.now() - state.updatedAt >= sTime : true);

      if (enabled && state.fetchStatus === 'idle') {
        const shouldFetch = state.status === 'pending' || isStale;
        if (shouldFetch && q.queryFn) {
          client.fetchQuery(q.queryKey, q.queryFn, { staleTime: q.staleTime, gcTime: q.gcTime }).catch(console.error);
        }
      }
    });
  }, [serializedKeys, client]);

  return results;
}

// --- useMutation Hook ---

interface UseMutationOptions<TData, TVariables, TContext> {
  mutationFn: (variables: TVariables) => Promise<TData>;
  onMutate?: (variables: TVariables) => Promise<TContext | undefined> | TContext | undefined;
  onSuccess?: (data: TData, variables: TVariables, context: TContext | undefined) => Promise<unknown> | unknown;
  onError?: (error: any, variables: TVariables, context: TContext | undefined) => Promise<unknown> | unknown;
  onSettled?: (data: TData | undefined, error: any | null, variables: TVariables, context: TContext | undefined) => Promise<unknown> | unknown;
}

export function useMutation<TData = any, TVariables = any, TContext = any>({
  mutationFn,
  onMutate,
  onSuccess,
  onError,
  onSettled,
}: UseMutationOptions<TData, TVariables, TContext>) {
  const [state, setState] = useState({
    data: undefined as TData | undefined,
    error: null as any,
    isPending: false,
    isSuccess: false,
    isError: false,
    variables: undefined as TVariables | undefined,
  });

  const mutateAsync = useCallback(async (variables: TVariables = undefined as any): Promise<TData> => {
    setState({
      data: undefined,
      error: null,
      isPending: true,
      isSuccess: false,
      isError: false,
      variables,
    });

    let context: TContext | undefined;
    if (onMutate) {
      context = await onMutate(variables);
    }

    try {
      const data = await mutationFn(variables);
      setState({
        data,
        error: null,
        isPending: false,
        isSuccess: true,
        isError: false,
        variables,
      });

      if (onSuccess) {
        await onSuccess(data, variables, context);
      }
      if (onSettled) {
        await onSettled(data, null, variables, context);
      }
      return data;
    } catch (error) {
      setState({
        data: undefined,
        error,
        isPending: false,
        isSuccess: false,
        isError: true,
        variables,
      });

      if (onError) {
        await onError(error, variables, context);
      }
      if (onSettled) {
        await onSettled(undefined, error, variables, context);
      }
      throw error;
    }
  }, [mutationFn, onMutate, onSuccess, onError, onSettled]);

  const mutate = useCallback((variables: TVariables) => {
    mutateAsync(variables).catch(() => {});
  }, [mutateAsync]);

  return {
    mutate,
    mutateAsync,
    ...state,
  };
}

export function useIsFetching(filters?: UseIsFetchingOptions) {
  const client = useQueryClient();
  const stableFilters = useMemo(
    () => filters,
    [JSON.stringify(filters ?? {})]
  );

  const getSnapshot = useCallback(() => client.getIsFetching(stableFilters), [client, stableFilters]);

  return useSyncExternalStore(
    useCallback(cb => client.subscribeAll(cb), [client]),
    getSnapshot,
    getSnapshot
  );
}

// --- useInfiniteQuery Hook ---

interface UseInfiniteQueryOptions<TData> {
  queryKey: QueryKey;
  queryFn: (context: { pageParam?: any }) => Promise<TData>;
  initialPageParam?: any;
  getNextPageParam: (lastPage: TData, allPages: TData[]) => any | undefined;
  enabled?: boolean;
  staleTime?: number;
  gcTime?: number;
}

export function useInfiniteQuery<TData = any>({
  queryKey,
  queryFn,
  initialPageParam,
  getNextPageParam,
  enabled = true,
  staleTime,
  gcTime,
}: UseInfiniteQueryOptions<TData>) {
  const client = useQueryClient();

  const stableQueryKey = useMemo(() => queryKey, [JSON.stringify(queryKey)]);

  const getSnapshot = useCallback(() => {
    const st = client.getOrCreateQuery<{ pages: TData[]; pageParams: any[] }>(stableQueryKey, {
      staleTime: staleTime ?? 0,
      gcTime: gcTime ?? 5 * 60 * 1000,
    });
    if (!st.data) {
      st.data = { pages: [], pageParams: [initialPageParam] };
    }
    return st;
  }, [client, stableQueryKey, initialPageParam]);

  const state = useSyncExternalStore(
    useCallback(cb => client.subscribe(stableQueryKey, cb), [client, stableQueryKey]),
    getSnapshot,
    getSnapshot
  );

  const [isFetchingNextPage, setIsFetchingNextPage] = useState(false);

  const fetchPage = useCallback(async (pageParam: any, isNext: boolean) => {
    if (!enabled) return;
    
    if (isNext) {
      setIsFetchingNextPage(true);
    } else {
      client.updateQueryState(stableQueryKey, () => ({
        fetchStatus: 'fetching',
      }));
    }

    try {
      const data = await queryFn({ pageParam });
      client.updateQueryState<{ pages: TData[]; pageParams: any[] }>(stableQueryKey, (currentState) => {
        const currentData = currentState.data || { pages: [], pageParams: [] };
        let nextPages = [...currentData.pages];
        let nextParams = [...currentData.pageParams];
        if (isNext) {
          nextPages.push(data);
          nextParams.push(pageParam);
        } else {
          nextPages = [data];
          nextParams = [pageParam];
        }
        return {
          data: { pages: nextPages, pageParams: nextParams },
          status: 'success',
          fetchStatus: 'idle',
          updatedAt: Date.now(),
        };
      });
    } catch (error) {
      client.updateQueryState(stableQueryKey, (prev) => ({
        ...prev,
        error,
        status: 'error',
        fetchStatus: 'idle',
        updatedAt: Date.now(),
      }));
    } finally {
      if (isNext) setIsFetchingNextPage(false);
    }
  }, [client, stableQueryKey, queryFn, enabled]);

  useEffect(() => {
    if (enabled && state.status === 'pending' && state.fetchStatus === 'idle') {
      fetchPage(initialPageParam, false);
    }
  }, [enabled, stableQueryKey, initialPageParam, fetchPage, state.status, state.fetchStatus]);

  const hasNextPage = useMemo(() => {
    if (!state.data || state.data.pages.length === 0) return false;
    const lastPage = state.data.pages[state.data.pages.length - 1];
    const nextParam = getNextPageParam(lastPage, state.data.pages);
    return nextParam !== undefined && nextParam !== null;
  }, [state.data, getNextPageParam]);

  const fetchNextPage = useCallback(() => {
    if (isFetchingNextPage || !hasNextPage || !state.data) return;
    const lastPage = state.data.pages[state.data.pages.length - 1];
    const nextParam = getNextPageParam(lastPage, state.data.pages);
    fetchPage(nextParam, true);
  }, [isFetchingNextPage, hasNextPage, state.data, getNextPageParam, fetchPage]);

  return {
    data: state.data,
    error: state.error,
    isLoading: state.status === 'pending' && state.fetchStatus === 'fetching',
    isFetching: state.fetchStatus === 'fetching',
    isFetchingNextPage,
    isError: state.status === 'error',
    isSuccess: state.status === 'success',
    hasNextPage,
    fetchNextPage,
    refetch: () => fetchPage(initialPageParam, false),
  };
}

// --- QueryErrorResetBoundary ---

const ResetContext = createContext<() => void>(() => {});

export const QueryErrorResetBoundary: React.FC<{ children: (value: { reset: () => void }) => React.ReactNode }> = ({ children }) => {
  const client = useQueryClient();
  const reset = useCallback(() => {
    client.invalidateQueries();
  }, [client]);

  return (
    <ResetContext.Provider value={reset}>
      {children({ reset })}
    </ResetContext.Provider>
  );
};
