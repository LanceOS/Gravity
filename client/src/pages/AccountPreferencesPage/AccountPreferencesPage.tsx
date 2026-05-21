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
import type { User } from '../../context/TicketContext';
import {
  AI_PROVIDER_OPTIONS,
  getProviderOption,
  type AIProvider,
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
  saveError: string | null;
  testing: boolean;
  testResult: StatusMessage | null;
  tutorialResult: StatusMessage | null;
  ollamaModels: string[];
  ollamaModelsLoading: boolean;
  onBack: () => void;
  onOpenDirectory: () => void;
  onChangeSettings: (updates: Partial<WorkspaceSettings>) => void;
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
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: 'var(--text-heading)' }}>Local account preferences</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: '12.5px', lineHeight: 1.5 }}>
            These settings apply to your signed-in Gravity account on this device, not to the shared workspace.
          </p>
        </div>

        <Grid columns={3} gap="var(--space-4)">
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
              { value: 'dark', label: 'Dark Slate' },
              { value: 'light', label: 'Light Slate' }
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
        </Grid>
      </Stack>
    </Card>
  );
}

function CloudProviderSection({
  settings,
  testing,
  testResult,
  onChangeSettings,
  onTestApiKey,
}: {
  settings: WorkspaceSettings;
  testing: boolean;
  testResult: StatusMessage | null;
  onChangeSettings: (updates: Partial<WorkspaceSettings>) => void;
  onTestApiKey: () => void;
}) {
  const providerOption = useMemo(() => getProviderOption(settings.aiProvider), [settings.aiProvider]);

  return (
    <Card style={{ padding: 'var(--space-6)', borderRadius: 'var(--radius-lg)' }}>
      <Stack gap="var(--space-5)">
        <div>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: 'var(--text-heading)' }}>Cloud AI provider</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: '12.5px', lineHeight: 1.5 }}>
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
            value={settings.apiKey}
            placeholder={providerOption.keyPlaceholder}
            onChange={(event) => onChangeSettings({ apiKey: event.target.value })}
          />
        </Grid>

        <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
          <Button variant="default" onClick={onTestApiKey} loading={testing}>
            Test {providerOption.label}
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
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: 'var(--text-heading)' }}>Local Ollama assistant</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: '12.5px', lineHeight: 1.5 }}>
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
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: 'var(--text-heading)' }}>Onboarding and guidance</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: '12.5px', lineHeight: 1.5 }}>
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
  saveError,
  testing,
  testResult,
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
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      {/* Top Header Bar */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: 'var(--space-4) var(--space-6)',
          borderBottom: '1px solid var(--border)',
          backgroundColor: 'var(--card-bg)',
          position: 'sticky',
          top: 0,
          zIndex: 100
        }}
      >
        <Flex align="center" gap="var(--space-4)">
          <Button variant="ghost" size="sm" onClick={onBack} leftIcon={<ArrowLeft size={14} />}>
            Back
          </Button>

          <Button variant="ghost" size="sm" onClick={onOpenDirectory} leftIcon={<Globe size={14} />}>
            Workspaces
          </Button>

          <Divider vertical style={{ height: '20px' }} />

          <div>
            <h1 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--text-heading)' }}>Account Preferences</h1>
            <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-muted)' }}>Configure your local user environment</p>
          </div>
        </Flex>

        <Button variant="accent" size="sm" onClick={onSaveSettings} loading={saveLoading}>
          {saveSuccess ? 'Changes Saved' : 'Save Changes'}
        </Button>
      </header>

      {/* Main Body Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '280px minmax(0, 1fr)', flexGrow: 1 }}>
        {/* Left Sidebar Menu */}
        <aside
          style={{
            borderRight: '1px solid var(--border)',
            backgroundColor: 'var(--sidebar-bg)',
            padding: 'var(--space-5)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-5)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', background: 'var(--card-bg)', border: '1px solid var(--border)' }}>
            <Avatar src={currentUser.avatar} name={currentUser.name} size="md" />
            <div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-heading)' }}>{currentUser.name}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{currentUser.email}</div>
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
                    background: isActive ? 'var(--card-bg)' : 'transparent',
                    borderColor: isActive ? 'var(--border)' : 'transparent',
                    cursor: 'pointer',
                    color: isActive ? 'var(--text-heading)' : 'var(--text-muted)',
                    textAlign: 'left',
                    transition: 'all var(--transition-fast)'
                  }}
                  className="clickable lib-focus-ring"
                  onClick={() => setActiveCategory(category.id)}
                >
                  <Icon size={16} style={{ color: isActive ? 'var(--accent)' : 'var(--text-muted)', flexShrink: 0 }} />
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600 }}>{category.label}</span>
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px', lineHeight: 1.2 }}>{category.description}</span>
                  </div>
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Right Content Pane */}
        <section style={{ padding: 'var(--space-6)', overflowY: 'auto', maxHeight: 'calc(100vh - 64px)' }}>
          <Stack gap="var(--space-5)" style={{ maxWidth: '800px', margin: '0 auto' }}>
            <div>
              <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                Account Settings
              </span>
              <h2 style={{ margin: '4px 0 0', fontSize: '24px', fontWeight: 700, color: 'var(--text-heading)', letterSpacing: '-0.02em' }}>
                {activeCategoryMeta.label}
              </h2>
              <p style={{ margin: '6px 0 0', fontSize: '13.5px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
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
        </section>
      </div>
    </div>
  );
}