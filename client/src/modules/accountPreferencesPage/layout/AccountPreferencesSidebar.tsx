import { Avatar } from '@library';
import {
  useAccountPreferencesCategoryContext,
  useAccountPreferencesRuntimeContext,
} from '../contexts/accountPreferencesPageContexts';

export function AccountPreferencesSidebar() {
  const { currentUser } = useAccountPreferencesRuntimeContext();
  const { activeCategory, categories, setActiveCategory } = useAccountPreferencesCategoryContext();

  return (
    <div className="account-preferences-page__sidebar">
      <div className="account-preferences-page__sidebar-user-card">
        <Avatar src={currentUser.avatar} name={currentUser.name} size="md" />
        <div className="account-preferences-page__sidebar-user-metadata">
          <div className="account-preferences-page__sidebar-user-name">{currentUser.name}</div>
          <div className="account-preferences-page__sidebar-user-email">{currentUser.email}</div>
        </div>
      </div>

      <nav className="account-preferences-page__sidebar-nav">
        {categories.map((category) => {
          const Icon = category.icon;
          const isActive = activeCategory === category.id;

          return (
            <button
              key={category.id}
              type="button"
              className={`account-preferences-page__sidebar-button ${isActive ? 'account-preferences-page__sidebar-button--active' : ''} clickable lib-focus-ring`}
              onClick={() => setActiveCategory(category.id)}
            >
              <Icon
                size={16}
                className={`account-preferences-page__sidebar-icon ${isActive ? 'account-preferences-page__sidebar-icon--active' : ''}`}
                aria-hidden="true"
              />
              <div className="account-preferences-page__sidebar-meta">
                <span className="account-preferences-page__sidebar-label">{category.label}</span>
                <span className="account-preferences-page__sidebar-description">{category.description}</span>
              </div>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
