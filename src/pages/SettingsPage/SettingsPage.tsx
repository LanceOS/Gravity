import { useMemo, useState } from 'react';
import {
  ArrowLeft,
  Bot,
  Check,
  Cpu,
  RefreshCw,
  Settings2,
  ShieldAlert,
  SlidersHorizontal,
  WandSparkles,
  AlertTriangle,
} from 'lucide-react';
import type { User } from '../../context/TicketContext';
import {
  AI_PROVIDER_OPTIONS,
  getProviderOption,
  type WorkspaceSettings,
  type AIProvider,
} from '../../utils/settings';
import './SettingsPage.css';

type SettingsCategoryId = 'general' | 'providers' | 'ollama' | 'onboarding';

interface StatusMessage {
  success: boolean;
  message: string;
}

interface SettingsPageProps {
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
  onBackToWorkspace: () => void;
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
    description: 'View mode, theme, and workspace density.',
    icon: Settings2,
  },
  {
    id: 'providers',
    label: 'Cloud AI',
    description: 'Provider selection and API credentials.',
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
    description: 'Replay the product tour and guided setup.',
    icon: Bot,
  },
];

function StatusNotice({ message, tone = 'neutral' }: { message: StatusMessage | { message: string } | null; tone?: 'neutral' | 'success' | 'error' }) {
  if (!message) {
    return null;
  }

  const icon = tone === 'success' ? <Check size={14} /> : tone === 'error' ? <AlertTriangle size={14} /> : null;

  return (
    <div className={`settings-page__notice settings-page__notice--${tone}`}>
      {icon}
      <span>{message.message}</span>
    </div>
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
    <div className="settings-page__section-card">
      <div className="settings-page__section-header">
        <h2 className="settings-page__section-title">General workspace preferences</h2>
        <p className="settings-page__section-subtitle">Control how Gravity opens and how dense the workspace feels.</p>
      </div>

      <div className="settings-page__grid">
        <label className="settings-page__field">
          <span className="settings-page__label">Default View Mode</span>
          <select
            className="settings-page__control"
            value={settings.defaultView}
            onChange={(event) => onChangeSettings({ defaultView: event.target.value as WorkspaceSettings['defaultView'] })}
          >
            <option value="board">Kanban Board</option>
            <option value="list">Issues List</option>
          </select>
        </label>

        <label className="settings-page__field">
          <span className="settings-page__label">Workspace Theme</span>
          <select
            className="settings-page__control"
            value={settings.theme}
            onChange={(event) => onChangeSettings({ theme: event.target.value as WorkspaceSettings['theme'] })}
          >
            <option value="dark">Dark Slate</option>
            <option value="light">Light Slate</option>
          </select>
        </label>

        <label className="settings-page__field">
          <span className="settings-page__label">Project Layout</span>
          <select
            className="settings-page__control"
            value={settings.projectLayout}
            onChange={(event) => onChangeSettings({ projectLayout: event.target.value as WorkspaceSettings['projectLayout'] })}
          >
            <option value="standard">Standard (Relaxed)</option>
            <option value="condensed">Condensed (High Density)</option>
          </select>
        </label>
      </div>
    </div>
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
    <div className="settings-page__section-card">
      <div className="settings-page__section-header">
        <h2 className="settings-page__section-title">Cloud AI provider</h2>
        <p className="settings-page__section-subtitle">Pick the provider you use and validate the matching credential.</p>
      </div>

      <div className="settings-page__grid">
        <label className="settings-page__field">
          <span className="settings-page__label">Provider</span>
          <select
            className="settings-page__control"
            value={settings.aiProvider}
            onChange={(event) => onChangeSettings({ aiProvider: event.target.value as AIProvider })}
          >
            {AI_PROVIDER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="settings-page__field settings-page__field--wide">
          <span className="settings-page__label">{providerOption.keyLabel}</span>
          <input
            className="settings-page__control"
            type="password"
            value={settings.apiKey}
            placeholder={providerOption.keyPlaceholder}
            onChange={(event) => onChangeSettings({ apiKey: event.target.value })}
          />
        </label>
      </div>

      <div className="settings-page__actions-row">
        <button type="button" className="settings-page__secondary-button" onClick={onTestApiKey} disabled={testing}>
          {testing ? 'Testing...' : `Test ${providerOption.label}`}
        </button>
      </div>

      <StatusNotice message={testResult} tone={testResult ? (testResult.success ? 'success' : 'error') : 'neutral'} />

      <div className="settings-page__warning-box">
        <ShieldAlert size={14} />
        <span>
          <strong>Token warning:</strong> Cloud requests consume external credits. Prefer Ollama when you want fully local execution.
        </span>
      </div>
    </div>
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

  return (
    <div className="settings-page__section-card">
      <div className="settings-page__section-header">
        <h2 className="settings-page__section-title">Local Ollama assistant</h2>
        <p className="settings-page__section-subtitle">Models are auto-detected from your Ollama instance. If detection fails, the list stays empty.</p>
      </div>

      <div className="settings-page__grid">
        <label className="settings-page__field settings-page__field--wide">
          <span className="settings-page__label">Ollama API Endpoint</span>
          <input
            className="settings-page__control"
            type="text"
            value={settings.ollamaEndpoint}
            placeholder="http://localhost:11434"
            onChange={(event) => onChangeSettings({ ollamaEndpoint: event.target.value })}
          />
        </label>

        <div className="settings-page__field">
          <span className="settings-page__label">Discovery</span>
          <button type="button" className="settings-page__secondary-button settings-page__secondary-button--inline" onClick={onRefreshOllamaModels}>
            <RefreshCw size={14} className={ollamaModelsLoading ? 'settings-page__spin' : ''} />
            <span>{ollamaModelsLoading ? 'Detecting...' : 'Refresh Models'}</span>
          </button>
        </div>

        <label className="settings-page__field settings-page__field--wide">
          <span className="settings-page__label">Detected Ollama Model</span>
          <select
            className="settings-page__control"
            value={detectedModelValue}
            disabled={ollamaModelsLoading || ollamaModels.length === 0}
            onChange={(event) => onChangeSettings({ ollamaModel: event.target.value })}
          >
            <option value="">
              {ollamaModelsLoading
                ? 'Detecting installed models...'
                : ollamaModels.length === 0
                  ? 'No models detected'
                  : 'Select a model'}
            </option>
            {ollamaModels.map((model) => (
              <option key={model} value={model}>
                {model}
              </option>
            ))}
          </select>
        </label>
      </div>

      {ollamaModels.length === 0 && !ollamaModelsLoading ? (
        <StatusNotice
          message={{ message: `Gravity could not detect any models at ${settings.ollamaEndpoint}. Start Ollama and install a model to populate this list.` }}
        />
      ) : null}
    </div>
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
    <div className="settings-page__section-card">
      <div className="settings-page__section-header">
        <h2 className="settings-page__section-title">Onboarding and guidance</h2>
        <p className="settings-page__section-subtitle">Replay the product tour the next time you reload or sign in.</p>
      </div>

      <div className="settings-page__actions-row">
        <button type="button" className="settings-page__secondary-button" onClick={onResetTutorial}>
          Reset & Start Tutorial
        </button>
      </div>

      <StatusNotice message={tutorialResult} tone={tutorialResult ? (tutorialResult.success ? 'success' : 'error') : 'neutral'} />
    </div>
  );
}

export function SettingsPage({
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
  onBackToWorkspace,
  onChangeSettings,
  onRefreshOllamaModels,
  onResetTutorial,
  onSaveSettings,
  onTestApiKey,
}: SettingsPageProps) {
  const [activeCategory, setActiveCategory] = useState<SettingsCategoryId>('general');

  const activeCategoryMeta = SETTINGS_CATEGORIES.find((category) => category.id === activeCategory) || SETTINGS_CATEGORIES[0];

  return (
    <div className="settings-page">
      <header className="settings-page__topbar">
        <div className="settings-page__topbar-main">
          <button type="button" className="settings-page__back-button" onClick={onBackToWorkspace}>
            <ArrowLeft size={14} />
            <span>Back to Workspace</span>
          </button>

          <div>
            <h1 className="settings-page__page-title">Workspace Settings</h1>
            <p className="settings-page__page-subtitle">Choose a settings category, then edit the preferences in that section.</p>
          </div>
        </div>

        <button type="button" className="settings-page__save-button" onClick={onSaveSettings} disabled={saveLoading}>
          {saveLoading ? 'Saving...' : saveSuccess ? 'Saved' : 'Save changes'}
        </button>
      </header>

      <div className="settings-page__body">
        <aside className="settings-page__sidebar">
          <div className="settings-page__profile-card">
            <img src={currentUser.avatar} alt={currentUser.name} className="settings-page__avatar" />
            <div>
              <div className="settings-page__profile-name">{currentUser.name}</div>
              <div className="settings-page__profile-email">{currentUser.email}</div>
            </div>
          </div>

          <nav className="settings-page__nav">
            {SETTINGS_CATEGORIES.map((category) => {
              const Icon = category.icon;

              return (
                <button
                  key={category.id}
                  type="button"
                  className={`settings-page__nav-item ${activeCategory === category.id ? 'settings-page__nav-item--active' : ''}`}
                  onClick={() => setActiveCategory(category.id)}
                >
                  <Icon size={16} />
                  <div className="settings-page__nav-copy">
                    <span className="settings-page__nav-label">{category.label}</span>
                    <span className="settings-page__nav-description">{category.description}</span>
                  </div>
                </button>
              );
            })}
          </nav>
        </aside>

        <section className="settings-page__content">
          <div className="settings-page__content-header">
            <div>
              <div className="settings-page__eyebrow">Selected Category</div>
              <h2 className="settings-page__content-title">{activeCategoryMeta.label}</h2>
              <p className="settings-page__content-subtitle">{activeCategoryMeta.description}</p>
            </div>
          </div>

          {settingsLoading ? <StatusNotice message={{ message: 'Loading saved settings...' }} /> : null}
          {saveError ? <StatusNotice message={{ message: saveError }} tone="error" /> : null}

          {activeCategory === 'general' ? (
            <GeneralSettingsSection settings={settings} onChangeSettings={onChangeSettings} />
          ) : null}

          {activeCategory === 'providers' ? (
            <CloudProviderSection
              settings={settings}
              testing={testing}
              testResult={testResult}
              onChangeSettings={onChangeSettings}
              onTestApiKey={onTestApiKey}
            />
          ) : null}

          {activeCategory === 'ollama' ? (
            <OllamaSettingsSection
              settings={settings}
              ollamaModels={ollamaModels}
              ollamaModelsLoading={ollamaModelsLoading}
              onChangeSettings={onChangeSettings}
              onRefreshOllamaModels={onRefreshOllamaModels}
            />
          ) : null}

          {activeCategory === 'onboarding' ? (
            <OnboardingSection tutorialResult={tutorialResult} onResetTutorial={onResetTutorial} />
          ) : null}
        </section>
      </div>
    </div>
  );
}