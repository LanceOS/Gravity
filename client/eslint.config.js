import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  { linterOptions: { reportUnusedDisableDirectives: 'error' } },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    rules: { '@typescript-eslint/no-unused-vars': ['error', { ignoreRestSiblings: true, argsIgnorePattern: '^_' }] },
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    // These modules expose compound component namespaces, context/provider pairs,
    // or the router/bootstrap itself. Vite may reload their consumers; they are
    // deliberately not standalone Fast Refresh boundaries.
    files: [
      'scripts/editor-trusted-types-fixture/main.tsx',
      'scripts/focus-accessibility-fixture/main.tsx',
      'scripts/hover-fixture/main.tsx',
      'scripts/picker-performance-fixture/main.tsx',
      'src/components/ConfirmDialog/ConfirmDialog.tsx',
      'src/components/FormSection/FormSection.tsx',
      'src/components/ManagementSurface/ManagementSurface.tsx',
      'src/components/ModalDialog/ModalDialog.tsx',
      'src/components/Sidebar/context/SidebarContext.tsx',
      'src/components/Sidebar/navigation/SidebarNavigation.tsx',
      'src/context/auth/AuthContext.tsx',
      'src/context/comment/CommentContext.tsx',
      'src/context/cycle/CycleContext.tsx',
      'src/context/filters/TicketFiltersContext.tsx',
      'src/context/label/LabelContext.tsx',
      'src/context/project/ActiveProjectContext.tsx',
      'src/context/project/ProjectContext.tsx',
      'src/context/realtime/RealtimeContext.tsx',
      'src/context/relation/TicketRelationsContext.tsx',
      'src/context/theme/ThemeContext.tsx',
      'src/context/ticket/TicketDetailContext.tsx',
      'src/context/ticket/TicketListContext.tsx',
      'src/context/ticket/TicketMutationContext.tsx',
      'src/context/ui/ActiveViewContext.tsx',
      'src/context/user/UserDirectoryContext.tsx',
      'src/layouts/WorkspacePageLayout/WorkspacePageLayout.tsx',
      'src/modules/ai/context/ChatContext.tsx',
      'src/modules/settings/components/ThemeProvider.tsx',
      'src/modules/tickets/utils/TicketList.tsx',
      'src/modules/workspaceProjectsPanel/context/WorkspaceProjectPanelActionsContext.tsx',
      'src/modules/workspaceProjectsPanel/context/WorkspaceProjectPanelProjectStateContext.tsx',
      'src/modules/workspaces/components/WorkspaceHeader.tsx',
      'src/router/index.tsx',
      'src/utils/react-query-mock.tsx',
    ],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
  {
    files: [
      'src/pages/**/*.{ts,tsx}',
      'src/components/**/*.{ts,tsx}',
      'src/layouts/**/*.{ts,tsx}',
      'src/router/**/*.{ts,tsx}',
    ],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          {
            group: [
              '../modules/*/*',
              '../../modules/*/*',
              '../../../modules/*/*',
              '../../../../modules/*/*',
            ],
            message: 'Import from a module public API barrel (for example, ../../modules/tickets) instead of reaching into module internals.',
          },
        ],
      }],
    },
  },
])
