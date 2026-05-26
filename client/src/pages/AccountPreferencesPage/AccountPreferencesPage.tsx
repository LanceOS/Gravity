import { useMemo, useState } from 'react';
import {
  ArrowLeft,
  Bot,
  Cpu,
  Globe,
  RefreshCw,
  Settings2,
  SlidersHorizontal,
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
  saveError: string | null;
  testing: boolean;
  testResult: StatusMessage | null;
  tutorialResult: StatusMessage | null;
  ollamaModels: string[];
  ollamaModelsLoading: boolean;
  onBack: () => void;
  onOpenDirectory: () => void;
  onChangeSettings: (updates: Partial<WorkspaceSettings>) => void;
  savedCredentials: SavedApiCredential[];
  onRefreshOllamaModels: () => void;
  onResetTutorial: () => void;
  onSaveSettings: () => void;
  onTestApiKey: () => void;
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
}: {
  settings: WorkspaceSettings;
  onChangeSettings: (updates: Partial<WorkspaceSettings>) => void;
}) {
  return (
    <Card style={{ padding: 'var(--space-6)', borderRadius: 'var(--radius-lg)' }}>
      <Stack gap="var(--space-5)">
        <div>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: 'var(--color-text-primary)' }}>Local account preferences</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--color-text-disabled)', fontSize: '12.5px', lineHeight: 1.5 }}>
            These settings apply to your signed-in Gravity account on this device, not to the shared workspace.
          </p>
        </div>

        <Grid columns={2} gap="var(--space-4)">
          <Select
            label="Default View Mode"
            value={settings.defaultView}
            onChange={(event) => onChangeSettings({ defaultView: event.target.value as WorkspaceSettings['defaultView'] })}
            options={[
              { value: 'board', label: 'Kanban Board' },
              { value: 'list', label: 'Issues List' }
            ]}
          />

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

function CloudProviderSection({
  settings,
  testing,
  testResult,
  savedCredentials,
  onChangeSettings,
  onTestApiKey,
}: {
  settings: WorkspaceSettings;
  testing: boolean;
  testResult: StatusMessage | null;
  savedCredentials: SavedApiCredential[];
  onChangeSettings: (updates: Partial<WorkspaceSettings>) => void;
  onTestApiKey: () => void;
}) {
  const providerOption = useMemo(() => getProviderOption(settings.aiProvider), [settings.aiProvider]);
  const hasStoredApiKey = settings.apiKey === API_KEY_MASK;

  return (
    <Card style={{ padding: 'var(--space-6)', borderRadius: 'var(--radius-lg)' }}>
      <Stack gap="var(--space-5)">
        <div>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: 'var(--color-text-primary)' }}>Cloud AI provider</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--color-text-disabled)', fontSize: '12.5px', lineHeight: 1.5 }}>
            These credentials stay with your local account and are not part of shared workspace settings.
          </p>
        </div>

        <Grid columns="1.5fr 3fr" gap="var(--space-4)">
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
            value={hasStoredApiKey ? '' : settings.apiKey}
            placeholder={hasStoredApiKey ? 'Stored in KMS. Enter a new key to replace.' : providerOption.keyPlaceholder}
            onChange={(event) => onChangeSettings({ apiKey: event.target.value })}
          />
        </Grid>

        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <Button variant="default" onClick={onTestApiKey} loading={testing}>
            Test {providerOption.label}
          </Button>
          {hasStoredApiKey && (
            <Button variant="ghost" onClick={() => onChangeSettings({ apiKey: '' })}>
              Remove stored key
            </Button>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 'var(--space-3)' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: 'var(--color-text-primary)' }}>Saved keys</h3>
              <p style={{ margin: '4px 0 0', color: 'var(--color-text-disabled)', fontSize: '12px', lineHeight: 1.5 }}>
                Masked credentials stored for this account.
              </p>
            </div>
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-disabled)' }}>
              {savedCredentials.length} saved
            </span>
          </div>

          {savedCredentials.length === 0 ? (
            <Alert type="info">Save a key to add it to the list.</Alert>
          ) : (
            <Stack gap="var(--space-2)">
              {savedCredentials.map((credential) => {
                const credentialOption = getProviderOption(credential.provider);
                const isActive = credential.provider === settings.aiProvider;

                return (
                  <div
                    key={credential.provider}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 'var(--space-4)',
                      padding: 'var(--space-3) var(--space-4)',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--color-border-default)',
                      background: 'var(--color-surface-card)',
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                        {credentialOption.label}
                      </div>
                      <div style={{ marginTop: '2px', fontSize: '12px', color: 'var(--color-text-disabled)' }}>
                        {credential.apiKey}
                      </div>
                    </div>

                    <span
                      style={{
                        flexShrink: 0,
                        padding: '2px 8px',
                        borderRadius: '999px',
                        fontSize: '11px',
                        fontWeight: 700,
                        letterSpacing: '0.02em',
                        color: isActive ? 'var(--color-success)' : 'var(--color-text-disabled)',
                        background: isActive ? 'color-mix(in srgb, var(--color-success) 12%, transparent)' : 'var(--color-surface-muted)',
                        border: `1px solid ${isActive ? 'color-mix(in srgb, var(--color-success) 28%, transparent)' : 'var(--color-border-default)'}`,
                      }}
                    >
                      {isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                );
              })}
            </Stack>
          )}
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
}: {
  settings: WorkspaceSettings;
  ollamaModels: string[];
  ollamaModelsLoading: boolean;
  onChangeSettings: (updates: Partial<WorkspaceSettings>) => void;
  onRefreshOllamaModels: () => void;
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
    <Card style={{ padding: 'var(--space-6)', borderRadius: 'var(--radius-lg)' }}>
      <Stack gap="var(--space-5)">
        <div>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: 'var(--color-text-primary)' }}>Local Ollama assistant</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--color-text-disabled)', fontSize: '12.5px', lineHeight: 1.5 }}>
            Models are auto-detected from your Ollama instance and stored as a local account preference.
          </p>
        </div>

        <Grid columns="3fr 1fr" gap="var(--space-4)" style={{ alignItems: 'end' }}>
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
    <Card style={{ padding: 'var(--space-6)', borderRadius: 'var(--radius-lg)' }}>
      <Stack gap="var(--space-5)">
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
  onRefreshOllamaModels,
  onResetTutorial,
  onSaveSettings,
  onTestApiKey,
}: AccountPreferencesPageProps) {
  const [activeCategory, setActiveCategory] = useState<SettingsCategoryId>('general');

  const activeCategoryMeta = SETTINGS_CATEGORIES.find((category) => category.id === activeCategory) || SETTINGS_CATEGORIES[0];

  return (
    <DashboardLayout>
      <DashboardLayout.Header
        leftContent={
          <Flex align="center" gap="var(--space-4)">
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
        }
        rightContent={
          <Button variant="accent" size="sm" onClick={onSaveSettings} loading={saveLoading} disabled={!hasChanges}>
            {saveSuccess ? 'Changes Saved' : 'Save Changes'}
          </Button>
        }
      />

      <DashboardLayout.Sidebar>
        <div style={{ padding: 'var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-5)', height: '100%', overflowY: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface-card)', border: '1px solid var(--color-border-default)' }}>
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
                    gap: 'var(--space-3)',
                    padding: 'var(--space-3) var(--space-4)',
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
          <div style={{ padding: 'var(--space-6) var(--space-6) var(--space-8) var(--space-6)', maxWidth: '800px', margin: '0 auto' }}>
            <Stack gap="var(--space-5)">
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

              {activeCategory === 'general' && (
                <GeneralSettingsSection settings={settings} onChangeSettings={onChangeSettings} />
              )}

              {activeCategory === 'providers' && (
                <CloudProviderSection
                  settings={settings}
                  testing={testing}
                  testResult={testResult}
                  savedCredentials={savedCredentials}
                  onChangeSettings={onChangeSettings}
                  onTestApiKey={onTestApiKey}
                />
              )}

              {activeCategory === 'ollama' && (
                <OllamaSettingsSection
                  settings={settings}
                  ollamaModels={ollamaModels}
                  ollamaModelsLoading={ollamaModelsLoading}
                  onChangeSettings={onChangeSettings}
                  onRefreshOllamaModels={onRefreshOllamaModels}
                />
              )}

              {activeCategory === 'onboarding' && (
                <OnboardingSection tutorialResult={tutorialResult} onResetTutorial={onResetTutorial} />
              )}
            </Stack>
          </div>
        </DashboardLayout.Content>
      </DashboardLayout.Main>
    </DashboardLayout>
  );
}