import React, { useState } from 'react';
import { ArrowLeft, Globe, Link2, Settings2, ShieldCheck, UserPlus, Users } from 'lucide-react';
import { Button, Divider, Flex, Avatar, Stack, Alert } from '@library';
import type { SettingsScreenProps, SettingsCategoryId } from '../types';
import { useIsMobile } from '../../../hooks/useIsMobile';
import { SettingsPageLayout } from '../../../layouts/SettingsPageLayout/SettingsPageLayout';
import { SettingsScreenContextProvider } from '../../../context/settings/SettingsScreenContext';
import { OverviewSection } from '../components/OverviewSection';
import { DangerZoneSection } from '../components/DangerZoneSection';
import { AccessSection } from '../components/AccessSection';
import { MembersSection } from '../components/MembersSection';
import { RequestsSection } from '../components/RequestsSection';
import { McpToolsSection } from '../components/McpToolsSection';

const SETTINGS_CATEGORIES: Array<{
  id: SettingsCategoryId;
  label: string;
  description: string;
  icon: typeof Settings2;
}> = [
  {
    id: 'overview',
    label: 'Overview',
    description: 'Workspace identity, host location, and join policy.',
    icon: Settings2,
  },
  {
    id: 'mcp_tools',
    label: 'MCP Tools',
    description: 'Enable or disable AI agent tools for this workspace.',
    icon: ShieldCheck,
  },
  {
    id: 'access',
    label: 'Invites',
    description: 'Create invite links and review access entry points.',
    icon: Link2,
  },
  {
    id: 'members',
    label: 'Members',
    description: 'Inspect the people who already belong to this workspace.',
    icon: Users,
  },
  {
    id: 'requests',
    label: 'Join Requests',
    description: 'Approve or review pending access requests.',
    icon: UserPlus,
  },
];

export function SettingsScreen(props: SettingsScreenProps) {
  const {
    currentUser,
    workspace,
    settings,
    settingsLoading,
    saveLoading,
    saveSuccess,
    saveError,
    inviteError,
    onBackToWorkspace,
    onOpenDirectory,
    onSaveSettings,
    onApproveJoinRequest,
  } = props;
  const [activeCategory, setActiveCategory] = useState<SettingsCategoryId>('overview');
  const isMobile = useIsMobile();

  const activeCategoryMeta = SETTINGS_CATEGORIES.find((category) => category.id === activeCategory) || SETTINGS_CATEGORIES[0];

  return (
    <SettingsScreenContextProvider
      value={{
        ...props,
        isMobile,
      }}
    >
      <SettingsPageLayout
        headerLeftContent={
          isMobile ? (
            <Button variant="ghost" size="sm" onClick={onBackToWorkspace} leftIcon={<ArrowLeft size={14} />}>
              Workspace
            </Button>
          ) : (
            <Flex align="center" gap="var(--space-md)">
              <Button variant="ghost" size="sm" onClick={onBackToWorkspace} leftIcon={<ArrowLeft size={14} />}>
                Workspace
              </Button>

              <Button variant="ghost" size="sm" onClick={onOpenDirectory} leftIcon={<Globe size={14} />}>
                Workspaces
              </Button>

              <Divider vertical style={{ height: '20px' }} />

              <div>
                <h1 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                  Workspace Settings
                </h1>
                <p style={{ margin: 0, fontSize: '11px', color: 'var(--color-text-disabled)' }}>
                  Managing {workspace.name}
                </p>
              </div>
            </Flex>
          )
        }
        headerRightContent={
          isMobile ? (
            <Button variant="ghost" size="sm" onClick={onOpenDirectory} leftIcon={<Globe size={14} />}>
              Workspaces
            </Button>
          ) : (
            <Button variant="accent" size="sm" onClick={onSaveSettings} loading={saveLoading}>
              {saveSuccess ? 'Changes Saved' : 'Save Changes'}
            </Button>
          )
        }
        sidebar={
          <div style={{ padding: 'var(--space-lg)', display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)', height: '100%', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', padding: 'var(--space-md)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface-card)', border: '1px solid var(--color-border-default)' }}>
              <Avatar src={currentUser.avatar} name={currentUser.name} size="md" />
              <div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)' }}>{currentUser.name}</div>
                <div style={{ fontSize: '11px', color: 'var(--color-text-disabled)' }}>Managing {workspace.key}</div>
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
                    transition: 'background-color var(--transition-fast), border-color var(--transition-fast), color var(--transition-fast)'
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
        }
      >
        <div style={{ padding: 'var(--space-lg) var(--space-lg) var(--space-xl) var(--space-lg)', maxWidth: '800px', margin: '0 auto' }}>
          <Stack gap="var(--space-lg)">
            {!isMobile && (
              <div>
                <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text-disabled)' }}>
                  Settings Section
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
                Loading workspace administration data...
              </Alert>
            )}

            {saveError && (
              <Alert type="error">
                {saveError}
              </Alert>
            )}

            {inviteError && (
              <Alert type="error">
                {inviteError}
              </Alert>
            )}

            {(isMobile || activeCategory === 'overview') && (
              <>
                <OverviewSection />
                <DangerZoneSection />
              </>
            )}

            {(isMobile || activeCategory === 'access') && <AccessSection />}

            {(isMobile || activeCategory === 'members') && <MembersSection />}

            {(isMobile || activeCategory === 'requests') && <RequestsSection />}

            {(isMobile || activeCategory === 'mcp_tools') && <McpToolsSection />}

            {isMobile && (
              <div style={{ display: 'flex', marginTop: 'var(--space-md)' }}>
                <Button
                  variant="accent"
                  size="lg"
                  onClick={onSaveSettings}
                  loading={saveLoading}
                  style={{ width: '100%', justifyContent: 'center' }}
                >
                  {saveSuccess ? 'Changes Saved' : 'Save Changes'}
                </Button>
              </div>
            )}
          </Stack>
        </div>
      </SettingsPageLayout>
    </SettingsScreenContextProvider>
  );
}
