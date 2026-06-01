import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Bot,
  Cpu,
  Globe,
  RefreshCw,
  Settings2,
  SlidersHorizontal,
  Trash2,
  WandSparkles,
} from 'lucide-react';
import {
  Button,
  TextInput,
  Select,
  Grid,
  Stack,
  Flex,
  Card,
  Alert,
  Divider,
  Avatar,
} from '@library';
import { DashboardLayout } from '../../components/DashboardLayout/DashboardLayout';
import type { User } from '../../context/TicketContext';
import {
  AI_PROVIDER_OPTIONS,
  API_KEY_MASK,
  getProviderOption,
  type AIProvider,
  type SavedApiCredential,
  type WorkspaceSettings,
} from '../../utils/settings';

type SettingsCategoryId = 'general' | 'providers' | 'ollama' | 'onboarding';

interface StatusMessage {
  success: boolean;
  message: string;
}

interface AccountPreferencesPageProps {
  currentUser: User;
  settings: WorkspaceSettings;
  settingsLoading: boolean;
  saveLoading: boolean;
  saveSuccess: boolean;
  hasChanges?: boolean;
  hasProviderChanges?: boolean;
  saveError: string | null;
  testing: boolean;
  testResult: StatusMessage | null;
  tutorialResult: StatusMessage | null;
  ollamaModels: string[];
  ollamaModelsLoading: boolean;
  onBack: () => void;
  onOpenDirectory: () => void;
  onChangeSettings: (updates: Partial<WorkspaceSettings>) => void;
  onResetProviderDraft: () => void;
  savedCredentials: SavedApiCredential[];
  onRefreshOllamaModels: () => void;
  onResetTutorial: () => void;
  onSaveSettings: () => void;
  onTestApiKey: () => void;
  onRemoveCredential: (provider: AIProvider) => void;
}

const SETTINGS_CATEGORIES: Array<{
  id: SettingsCategoryId;
  label: string;
  description: string;
  icon: typeof SlidersHorizontal;
}> = [
    {
      id: 'general',
      label: 'General',
      description: 'Theme, default view, and board density for your local account.',
      icon: Settings2,
    },
    {
      id: 'providers',
      label: 'Cloud AI',
      description: 'Provider selection and API credentials for your account.',
      icon: WandSparkles,
    },
    {
      id: 'ollama',
      label: 'Ollama',
      description: 'Local endpoint and installed model detection.',
      icon: Cpu,
    },
    {
      id: 'onboarding',
      label: 'Onboarding',
      description: 'Replay the product tour and guided setup for this account.',
      icon: Bot,
    },
  ];

function StatusNotice({ message, tone = 'neutral' }: { message: StatusMessage | { message: string } | null; tone?: 'neutral' | 'success' | 'error' }) {
  if (!message) {
    return null;
  }

  const alertType = tone === 'success' ? 'success' : tone === 'error' ? 'error' : 'info';

  return (
    <Alert type={alertType}>
      {message.message}
    </Alert>
  );
}

function GeneralSettingsSection({
  settings,
  onChangeSettings,
  isMobile,
}: {
  settings: WorkspaceSettings;
  onChangeSettings: (updates: Partial<WorkspaceSettings>) => void;
  isMobile: boolean;
}) {
  return (
    <Card style={{ padding: 'var(--space-lg)', borderRadius: 'var(--radius-lg)' }}>
      <Stack gap="var(--space-lg)">
        <div>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: 'var(--color-text-primary)' }}>Local account preferences</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--color-text-disabled)', fontSize: '12.5px', lineHeight: 1.5 }}>
            These settings apply to your signed-in Gravity account on this device, not to the shared workspace.
          </p>
        </div>

        <Grid columns={isMobile ? 1 : 2} gap="var(--space-md)">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
            <Select
              label="Default View Mode"
              value={settings.defaultView}
              onChange={(event) => onChangeSettings({ defaultView: event.target.value as WorkspaceSettings['defaultView'] })}
              options={[
                { value: 'board', label: 'Kanban Board' },
                { value: 'list', label: 'Issues List' }
              ]}
            />
            {isMobile && (
              <Alert type="warning">
                Only <strong>List mode</strong> is available on mobile. Your default view preference will apply on desktop.
              </Alert>
            )}
          </div>

          <Select
            label="Workspace Theme"
            value={settings.theme}
            onChange={(event) => onChangeSettings({ theme: event.target.value as WorkspaceSettings['theme'] })}
            options={[
              { value: 'dark', label: 'Noir' },
              { value: 'coal-black', label: 'Coal Black' },
              { value: 'coffee', label: 'Coffee' },
              { value: 'marble-blue', label: 'Marble Blue' }
            ]}
          />

          <Select
            label="Project Layout"
            value={settings.projectLayout}
            onChange={(event) => onChangeSettings({ projectLayout: event.target.value as WorkspaceSettings['projectLayout'] })}
            options={[
              { value: 'standard', label: 'Standard (Relaxed)' },
              { value: 'condensed', label: 'Condensed (High Density)' }
            ]}
          />

          <Select
            label="Active Agent Integration"
            value={settings.agentIntegration}
            onChange={(event) => onChangeSettings({ agentIntegration: event.target.value as WorkspaceSettings['agentIntegration'] })}
            options={[
              { value: 'ollama', label: 'Local Ollama' },
              { value: 'third_party', label: 'Cloud AI Provider' }
            ]}
          />
        </Grid>
      </Stack>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// SavedKeyItem — reusable credential row
// ---------------------------------------------------------------------------
function SavedKeyItem({
  credential,
  isActive,
  onRemove,
}: {
  credential: SavedApiCredential;
  isActive: boolean;
  onRemove: () => void;
}) {
  const option = getProviderOption(credential.provider);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-sm)',
        padding: 'var(--space-md) var(--space-md)',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--color-border-default)',
        borderLeft: isActive
          ? '3px solid var(--color-accent)'
          : '1px solid var(--color-border-default)',
        background: 'var(--color-surface-card)',
      }}
    >
      {/* Provider name */}
      <div
        style={{
          fontSize: '13px',
          fontWeight: 600,
          color: 'var(--color-text-primary)',
        }}
      >
        {option.label}{credential.preferredModel ? ` — ${credential.preferredModel}` : ''}
      </div>

      {/* Masked key */}
      <div
        style={{
          fontSize: '11.5px',
          fontFamily: 'monospace',
          color: 'var(--color-text-disabled)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {credential.apiKey}
      </div>

      {/* Active label + remove button */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-md)' }}>
        <span
          style={{
            fontSize: '12px',
            fontWeight: 500,
            color: isActive ? 'var(--color-success)' : 'var(--color-text-disabled)',
          }}
        >
          {isActive ? 'Active' : 'Inactive'}
        </span>

        <Button
          variant="danger"
          size="sm"
          onClick={onRemove}
          aria-label={`Remove ${option.label} key`}
          title={`Remove ${option.label} key`}
        >
          <Trash2 size={13} aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SavedKeysCard — separate card listing all stored credentials
// ---------------------------------------------------------------------------
function SavedKeysCard({
  savedCredentials,
  activeProvider,
  onRemoveCredential,
}: {
  savedCredentials: SavedApiCredential[];
  activeProvider: AIProvider;
  onRemoveCredential: (provider: AIProvider) => void;
}) {
  return (
    <Card style={{ padding: 'var(--space-lg)', borderRadius: 'var(--radius-lg)' }}>
      <Stack gap="var(--space-md)">
        <div>
          <h3
            style={{
              margin: 0,
              fontSize: '15px',
              fontWeight: 600,
              color: 'var(--color-text-primary)',
            }}
          >
            Saved keys
          </h3>
          <p
            style={{
              margin: '3px 0 0',
              fontSize: '12px',
              color: 'var(--color-text-disabled)',
              lineHeight: 1.5,
            }}
          >
            Masked credentials stored securely for this account.
          </p>
          <span
            style={{
              display: 'inline-block',
              marginTop: 'var(--space-sm)',
              fontSize: '12px',
              color: 'var(--color-text-disabled)',
            }}
          >
            {savedCredentials.length} saved
          </span>
        </div>

        {savedCredentials.length === 0 ? (
          <Alert type="info">Save a key above to add it to this list.</Alert>
        ) : (
          <Stack gap="var(--space-sm)">
            {savedCredentials.map((credential) => (
              <SavedKeyItem
                key={credential.provider}
                credential={credential}
                isActive={credential.provider === activeProvider}
                onRemove={() => onRemoveCredential(credential.provider as AIProvider)}
              />
            ))}
          </Stack>
        )}
      </Stack>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// CloudProviderSection — entry card (provider selector + key input + actions)
// ---------------------------------------------------------------------------
function CloudProviderSection({
  settings,
  saveLoading,
  hasProviderChanges,
  testing,
  testResult,
  onChangeSettings,
  onSaveSettings,
  onTestApiKey,
  isMobile,
}: {
  settings: WorkspaceSettings;
  saveLoading: boolean;
  hasProviderChanges: boolean;
  testing: boolean;
  testResult: StatusMessage | null;
  onChangeSettings: (updates: Partial<WorkspaceSettings>) => void;
  onSaveSettings: () => void;
  onTestApiKey: () => void;
  isMobile: boolean;
}) {
  const providerOption = useMemo(() => getProviderOption(settings.aiProvider), [settings.aiProvider]);
  const hasStoredApiKey = settings.apiKey === API_KEY_MASK;

  return (
    <Card style={{ padding: 'var(--space-lg)', borderRadius: 'var(--radius-lg)' }}>
      <Stack gap="var(--space-lg)">
        <div>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: 'var(--color-text-primary)' }}>Cloud AI provider</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--color-text-disabled)', fontSize: '12.5px', lineHeight: 1.5 }}>
            These credentials stay with your local account and are not part of shared workspace settings.
          </p>
        </div>

        <Grid columns={isMobile ? 1 : '1.5fr 3fr'} gap="var(--space-md)">
          <Select
            label="Provider"
            value={settings.aiProvider}
            onChange={(event) => onChangeSettings({ aiProvider: event.target.value as AIProvider })}
            options={AI_PROVIDER_OPTIONS.map((option) => ({
              value: option.value,
              label: option.label,
            }))}
          />

          <TextInput
            label={providerOption.keyLabel}
            type="password"
            autoComplete="new-password"
            value={hasStoredApiKey ? '' : settings.apiKey}
            placeholder={hasStoredApiKey ? 'Stored in KMS. Enter a new key to replace.' : providerOption.keyPlaceholder}
            onChange={(event) => onChangeSettings({ apiKey: event.target.value })}
          />
        </Grid>

        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
          <Button variant="default" onClick={onTestApiKey} loading={testing}>
            Test {providerOption.label}
          </Button>
          <Button variant="accent" onClick={onSaveSettings} loading={saveLoading} disabled={!hasProviderChanges}>
            Save Key
          </Button>
        </div>

        {testResult && (
          <StatusNotice message={testResult} tone={testResult.success ? 'success' : 'error'} />
        )}

        <Alert type="warning">
          <strong>Token warning:</strong> Cloud requests consume external credits. Prefer Ollama when you want fully local execution.
        </Alert>
      </Stack>
    </Card>
  );
}

function OllamaSettingsSection({
  settings,
  ollamaModels,
  ollamaModelsLoading,
  onChangeSettings,
  onRefreshOllamaModels,
  isMobile,
}: {
  settings: WorkspaceSettings;
  ollamaModels: string[];
  ollamaModelsLoading: boolean;
  onChangeSettings: (updates: Partial<WorkspaceSettings>) => void;
  onRefreshOllamaModels: () => void;
  isMobile: boolean;
}) {
  const detectedModelValue = ollamaModels.includes(settings.ollamaModel) ? settings.ollamaModel : '';

  const modelOptions = [
    {
      value: '',
      label: ollamaModelsLoading
        ? 'Detecting installed models...'
        : ollamaModels.length === 0
          ? 'No models detected'
          : 'Select a model'
    },
    ...ollamaModels.map((model) => ({
      value: model,
      label: model,
    }))
  ];

  return (
    <Card style={{ padding: 'var(--space-lg)', borderRadius: 'var(--radius-lg)' }}>
      <Stack gap="var(--space-lg)">
        <div>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: 'var(--color-text-primary)' }}>Local Ollama assistant</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--color-text-disabled)', fontSize: '12.5px', lineHeight: 1.5 }}>
            Models are auto-detected from your Ollama instance and stored as a local account preference.
          </p>
        </div>

        <Grid columns={isMobile ? 1 : '3fr 1fr'} gap="var(--space-md)" style={{ alignItems: 'end' }}>
          <TextInput
            label="Ollama API Endpoint"
            value={settings.ollamaEndpoint}
            placeholder="http://localhost:11434"
            onChange={(event) => onChangeSettings({ ollamaEndpoint: event.target.value })}
          />

          <Button
            variant="default"
            onClick={onRefreshOllamaModels}
            loading={ollamaModelsLoading}
            leftIcon={<RefreshCw size={14} />}
            style={{ width: '100%' }}
          >
            Refresh
          </Button>
        </Grid>

        <Select
          label="Detected Ollama Model"
          value={detectedModelValue}
          disabled={ollamaModelsLoading || ollamaModels.length === 0}
          onChange={(event) => onChangeSettings({ ollamaModel: event.target.value })}
          options={modelOptions}
        />

        {ollamaModels.length === 0 && !ollamaModelsLoading && (
          <StatusNotice
            message={{ message: `Gravity could not detect any models at ${settings.ollamaEndpoint}. Start Ollama and install a model to populate this list.` }}
            tone="error"
          />
        )}
      </Stack>
    </Card>
  );
}

function OnboardingSection({
  tutorialResult,
  onResetTutorial,
}: {
  tutorialResult: StatusMessage | null;
  onResetTutorial: () => void;
}) {
  return (
    <Card style={{ padding: 'var(--space-lg)', borderRadius: 'var(--radius-lg)' }}>
      <Stack gap="var(--space-lg)">
        <div>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: 'var(--color-text-primary)' }}>Onboarding and guidance</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--color-text-disabled)', fontSize: '12.5px', lineHeight: 1.5 }}>
            Replay the product tour the next time you reload or sign in with this account.
          </p>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
          <Button variant="default" onClick={onResetTutorial}>
            Reset & Start Tutorial
          </Button>
        </div>

        {tutorialResult && (
          <StatusNotice message={tutorialResult} tone={tutorialResult.success ? 'success' : 'error'} />
        )}
      </Stack>
    </Card>
  );
}

export function AccountPreferencesPage({
  currentUser,
  settings,
  settingsLoading,
  saveLoading,
  saveSuccess,
  hasChanges,
  hasProviderChanges = false,
  saveError,
  testing,
  testResult,
  savedCredentials,
  tutorialResult,
  ollamaModels,
  ollamaModelsLoading,
  onBack,
  onOpenDirectory,
  onChangeSettings,
  onResetProviderDraft,
  onRefreshOllamaModels,
  onResetTutorial,
  onSaveSettings,
  onTestApiKey,
  onRemoveCredential,
}: AccountPreferencesPageProps) {
  const [activeCategory, setActiveCategory] = useState<SettingsCategoryId>('general');
  const [isMobile, setIsMobile] = useState(false);

  const activeCategoryMeta = SETTINGS_CATEGORIES.find((category) => category.id === activeCategory) || SETTINGS_CATEGORIES[0];

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (activeCategory !== 'providers') {
      return;
    }

    onResetProviderDraft();
  }, [activeCategory, onResetProviderDraft]);

  return (
    <DashboardLayout>
      <DashboardLayout.Header
        leftContent={
          isMobile ? (
            <Button variant="ghost" size="sm" onClick={onBack} leftIcon={<ArrowLeft size={14} />}>
              Back
            </Button>
          ) : (
            <Flex align="center" gap="var(--space-md)">
              <Button variant="ghost" size="sm" onClick={onBack} leftIcon={<ArrowLeft size={14} />}>
                Back
              </Button>

              <Button variant="ghost" size="sm" onClick={onOpenDirectory} leftIcon={<Globe size={14} />}>
                Workspaces
              </Button>

              <Divider vertical style={{ height: '20px' }} />

              <div>
                <h1 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--color-text-primary)' }}>Account Preferences</h1>
                <p style={{ margin: 0, fontSize: '11px', color: 'var(--color-text-disabled)' }}>Configure your local user environment</p>
              </div>
            </Flex>
          )
        }
        rightContent={
          isMobile ? (
            <Button variant="ghost" size="sm" onClick={onOpenDirectory} leftIcon={<Globe size={14} />}>
              Workspaces
            </Button>
          ) : (
            <Button variant="accent" size="sm" onClick={onSaveSettings} loading={saveLoading} disabled={!hasChanges}>
              {saveSuccess ? 'Changes Saved' : 'Save Changes'}
            </Button>
          )
        }
      />

      <DashboardLayout.Sidebar>
        <div style={{ padding: 'var(--space-lg)', display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)', height: '100%', overflowY: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', padding: 'var(--space-md)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface-card)', border: '1px solid var(--color-border-default)' }}>
            <Avatar src={currentUser.avatar} name={currentUser.name} size="md" />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{currentUser.name}</div>
              <div style={{ fontSize: '11px', color: 'var(--color-text-disabled)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{currentUser.email}</div>
            </div>
          </div>

          <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {SETTINGS_CATEGORIES.map((category) => {
              const Icon = category.icon;
              const isActive = activeCategory === category.id;

              return (
                <button
                  key={category.id}
                  type="button"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-md)',
                    padding: 'var(--space-md) var(--space-md)',
                    border: '1px solid transparent',
                    borderRadius: 'var(--radius-md)',
                    background: isActive ? 'var(--color-surface-card)' : 'transparent',
                    borderColor: isActive ? 'var(--color-border-default)' : 'transparent',
                    cursor: 'pointer',
                    color: isActive ? 'var(--color-text-primary)' : 'var(--color-text-disabled)',
                    textAlign: 'left',
                    transition: 'all var(--transition-fast)'
                  }}
                  className="clickable lib-focus-ring"
                  onClick={() => setActiveCategory(category.id)}
                >
                  <Icon size={16} style={{ color: isActive ? 'var(--color-primary)' : 'var(--color-text-disabled)', flexShrink: 0 }} />
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600 }}>{category.label}</span>
                    <span style={{ fontSize: '10px', color: 'var(--color-text-disabled)', marginTop: '2px', lineHeight: 1.2 }}>{category.description}</span>
                  </div>
                </button>
              );
            })}
          </nav>
        </div>
      </DashboardLayout.Sidebar>

      <DashboardLayout.Main>
        <DashboardLayout.Content>
          <div style={{ padding: 'var(--space-lg) var(--space-lg) var(--space-xl) var(--space-lg)', maxWidth: '800px', margin: '0 auto' }}>
            <Stack gap="var(--space-lg)">
              {!isMobile && (
                <div>
                  <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text-disabled)' }}>
                    Account Settings
                  </span>
                  <h2 style={{ margin: '4px 0 0', fontSize: '24px', fontWeight: 700, color: 'var(--color-text-primary)', letterSpacing: '-0.02em' }}>
                    {activeCategoryMeta.label}
                  </h2>
                  <p style={{ margin: '6px 0 0', fontSize: '13.5px', color: 'var(--color-text-disabled)', lineHeight: 1.5 }}>
                    {activeCategoryMeta.description}
                  </p>
                </div>
              )}

              {settingsLoading && (
                <Alert type="info">
                  Loading saved account settings...
                </Alert>
              )}

              {saveError && (
                <Alert type="error">
                  {saveError}
                </Alert>
              )}

              {(isMobile || activeCategory === 'general') && (
                <GeneralSettingsSection settings={settings} onChangeSettings={onChangeSettings} isMobile={isMobile} />
              )}

              {(isMobile || activeCategory === 'providers') && (
                <Stack gap="var(--space-md)">
                  <CloudProviderSection
                    settings={settings}
                    saveLoading={saveLoading}
                    hasProviderChanges={hasProviderChanges}
                    testing={testing}
                    testResult={testResult}
                    onChangeSettings={onChangeSettings}
                    onSaveSettings={onSaveSettings}
                    onTestApiKey={onTestApiKey}
                    isMobile={isMobile}
                  />
                  <SavedKeysCard
                    savedCredentials={savedCredentials}
                    activeProvider={settings.aiProvider}
                    onRemoveCredential={onRemoveCredential}
                  />
                </Stack>
              )}

              {(isMobile || activeCategory === 'ollama') && (
                <OllamaSettingsSection
                  settings={settings}
                  ollamaModels={ollamaModels}
                  ollamaModelsLoading={ollamaModelsLoading}
                  onChangeSettings={onChangeSettings}
                  onRefreshOllamaModels={onRefreshOllamaModels}
                  isMobile={isMobile}
                />
              )}

              {(isMobile || activeCategory === 'onboarding') && (
                <OnboardingSection tutorialResult={tutorialResult} onResetTutorial={onResetTutorial} />
              )}

              {isMobile && (
                <div style={{ display: 'flex', marginTop: 'var(--space-md)' }}>
                  <Button
                    variant="accent"
                    size="lg"
                    onClick={onSaveSettings}
                    loading={saveLoading}
                    disabled={!hasChanges}
                    style={{ width: '100%', justifyContent: 'center' }}
                  >
                    {saveSuccess ? 'Changes Saved' : 'Save Changes'}
                  </Button>
                </div>
              )}
            </Stack>
          </div>
        </DashboardLayout.Content>
      </DashboardLayout.Main>
    </DashboardLayout>
  );
}