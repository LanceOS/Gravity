import { Button, Grid, Stack, TextInput, Select, Card } from '@library';

import { RefreshCw } from 'lucide-react';
import { useIsMobile } from '../../../../hooks/useIsMobile';
import { StatusNotice } from '../StatusNotice';
import { getOllamaModelOptions, getOllamaModelValue, getOllamaMissingModelsMessage } from '../../utils/accountPreferences';
import {
  useAccountPreferencesOllamaContext,
  useAccountPreferencesSettingsContext,
} from '../../../../context/accountPreferencesPage/accountPreferencesPageContextHooks';

export function OllamaSettingsSection() {
  const { settings, onChangeSettings } = useAccountPreferencesSettingsContext();
  const { ollamaModels, ollamaModelsLoading, onRefreshOllamaModels } = useAccountPreferencesOllamaContext();
  const isMobile = useIsMobile();

  const detectedModelValue = getOllamaModelValue(ollamaModels, settings.ollamaModel);
  const modelOptions = getOllamaModelOptions(ollamaModels, ollamaModelsLoading);

  return (
    <Card className="account-preferences-page__section-card">
      <Stack gap="var(--space-lg)">
        <div>
          <h2 className="account-preferences-page__section-title">Local Ollama assistant</h2>
          <p className="account-preferences-page__section-description">
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
            className="account-preferences-page__button-full"
            variant="default"
            onClick={onRefreshOllamaModels}
            loading={ollamaModelsLoading}
            leftIcon={<RefreshCw size={14} />}
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
            message={{ message: getOllamaMissingModelsMessage(settings.ollamaEndpoint) }}
            tone="error"
          />
        )}
      </Stack>
    </Card>
  );
}
