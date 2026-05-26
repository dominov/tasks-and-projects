import type { Category, Project, Tag } from '../../common/types'
import type { ViewType } from './ViewManager'

interface SideMenuProps {
  viewType: ViewType
  projects: Project[]
  tags: Tag[]
  categories: Category[]
  showCompletedTasks: boolean
  selectedProjectId: number | null
  selectedTagId: number | null
  selectedCategoryId: number | null
  isDataOperationLoading: boolean
  onChangeView: (view: ViewType) => void
  onToggleCompletedTasks: (showCompleted: boolean) => void
  onSelectProject: (projectId: number | null) => void
  onSelectTag: (tagId: number | null) => void
  onSelectCategory: (categoryId: number | null) => void
  onOpenProjectCreateView: () => void
  onOpenTagCreateView: () => void
  onOpenCategoryCreateView: () => void
  onDeleteProject: (project: Project) => void
  onDeleteTag: (tag: Tag) => void
  onDeleteCategory: (category: Category) => void
  onExportData: () => void
  onImportData: () => void
}

type IconName = 'calendar-days' | 'check-square' | 'target' | 'calendar' | 'chart' | 'focus' | 'plus' | 'trash'

const viewMenu: Array<{ id: ViewType; label: string; icon: IconName }> = [
  { id: 'focus', label: 'Focus', icon: 'focus' },
  { id: 'tasks', label: 'My Tasks', icon: 'check-square' },
  { id: 'goals', label: 'Goals', icon: 'target' },
  { id: 'calendar', label: 'Calendar', icon: 'calendar' },
  { id: 'gantt', label: 'Gantt', icon: 'chart' },
]

function SidebarIcon({ name }: { name: IconName }) {
  if (name === 'calendar-days') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="menu-icon">
        <rect x="3" y="4" width="18" height="17" rx="2" />
        <line x1="8" y1="2.5" x2="8" y2="6.5" />
        <line x1="16" y1="2.5" x2="16" y2="6.5" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </svg>
    )
  }

  if (name === 'check-square') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="menu-icon">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <polyline points="8,12 11,15 16,9" />
      </svg>
    )
  }

  if (name === 'target') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="menu-icon">
        <circle cx="12" cy="12" r="8" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="12" cy="12" r="1" />
      </svg>
    )
  }

  if (name === 'calendar') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="menu-icon">
        <rect x="3" y="4" width="18" height="17" rx="2" />
        <line x1="8" y1="2.5" x2="8" y2="6.5" />
        <line x1="16" y1="2.5" x2="16" y2="6.5" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </svg>
    )
  }

  if (name === 'chart') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="menu-icon">
        <line x1="4" y1="20" x2="20" y2="20" />
        <rect x="6" y="11" width="3" height="9" rx="1" />
        <rect x="11" y="7" width="3" height="13" rx="1" />
        <rect x="16" y="4" width="3" height="16" rx="1" />
      </svg>
    )
  }

  if (name === 'plus') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="menu-icon menu-icon--mini">
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
      </svg>
    )
  }

  if (name === 'focus') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="menu-icon">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="menu-icon menu-icon--mini">
      <path d="M4 7h16" />
      <path d="M9 7V5h6v2" />
      <path d="M7 7l1 12h8l1-12" />
    </svg>
  )
}

function SideMenu({
  viewType,
  projects,

  categories,
  tags,
  showCompletedTasks,
  selectedProjectId,
  selectedTagId,
  selectedCategoryId,
  isDataOperationLoading,
  onChangeView,
  onToggleCompletedTasks,
  onSelectProject,
  onSelectTag,
  onSelectCategory,
  onOpenProjectCreateView,
  onOpenTagCreateView,
  onOpenCategoryCreateView,
  onDeleteProject,
  onDeleteTag,
  onDeleteCategory,
  onExportData,
  onImportData,
}: SideMenuProps) {
  return (
    <aside className="side-menu">
      <div className="menu-top">
        <nav aria-label="Main views">
          {viewMenu.map((item) => (
            <button
              key={item.id}
              type="button"
              className={viewType === item.id ? 'nav-item active' : 'nav-item'}
              onClick={() => onChangeView(item.id)}
            >
              <span className="nav-item-label">
                <SidebarIcon name={item.icon} />
                {item.label}
              </span>
            </button>
          ))}
        </nav>
      </div>

      <section className="menu-section menu-section--toggle">
        <label className="completed-toggle">
          <span>Show completed tasks</span>
          <input
            type="checkbox"
            checked={showCompletedTasks}
            onChange={(event) => onToggleCompletedTasks(event.target.checked)}
          />
        </label>
      </section>

      <section className="menu-section">
        <div className="menu-section-title-row">
          <h3>Projects</h3>
          <button type="button" className="mini-add" onClick={onOpenProjectCreateView}>
            <SidebarIcon name="plus" />
            Add
          </button>
        </div>
        <button
          type="button"
          className={selectedProjectId === null ? 'chip active' : 'chip'}
          onClick={() => onSelectProject(null)}
        >
          All Projects
        </button>
        {projects.map((project) => (
          <div key={project.id} className="entity-chip-row">
            <button
              type="button"
              className={selectedProjectId === project.id ? 'chip active' : 'chip'}
              onClick={() => onSelectProject(project.id)}
            >
              <span
                className="dot"
                aria-hidden="true"
                style={{
                  backgroundColor: project.color,
                  borderColor: project.color,
                }}
              />
              {project.name}
            </button>
            <button type="button" className="chip-delete" onClick={() => onDeleteProject(project)} aria-label="Delete project">
              <SidebarIcon name="trash" />
            </button>
          </div>
        ))}
      </section>


      <section className="menu-section">
        <div className="menu-section-title-row">
          <h3>Categories</h3>
          <button type="button" className="mini-add" onClick={onOpenCategoryCreateView}>
            <SidebarIcon name="plus" />
            Add
          </button>
        </div>
        <button
          type="button"
          className={selectedCategoryId === null ? 'chip active' : 'chip'}
          onClick={() => onSelectCategory(null)}
        >
          All Categories
        </button>
        {categories.map((category) => (
          <div key={category.id} className="entity-chip-row">
            <button
              type="button"
              className={selectedCategoryId === category.id ? 'chip active' : 'chip'}
              onClick={() => onSelectCategory(category.id)}
            >
              {category.name}
            </button>
            <button type="button" className="chip-delete" onClick={() => onDeleteCategory(category)} aria-label="Delete category">
              <SidebarIcon name="trash" />
            </button>
          </div>
        ))}
      </section>
      
      <section className="menu-section">
        <div className="menu-section-title-row">
          <h3>Tags</h3>
          <button type="button" className="mini-add" onClick={onOpenTagCreateView}>
            <SidebarIcon name="plus" />
            Add
          </button>
        </div>
        <button
          type="button"
          className={selectedTagId === null ? 'chip active' : 'chip'}
          onClick={() => onSelectTag(null)}
        >
          All Tags
        </button>
        {tags.map((tag) => (
          <div key={tag.id} className="entity-chip-row">
            <button
              type="button"
              className={selectedTagId === tag.id ? 'chip active' : 'chip'}
              onClick={() => onSelectTag(tag.id)}
            >
              <span className={`dot project-dot--tone-${tag.id % 6}`} aria-hidden="true" />
              <span className="tag-prefix">#</span>
              {tag.name}
            </button>
            <button type="button" className="chip-delete" onClick={() => onDeleteTag(tag)} aria-label="Delete tag">
              <SidebarIcon name="trash" />
            </button>
          </div>
        ))}
      </section>

      <section className="menu-section menu-section--data-actions">
        <div className="menu-section-title-row">
          <h3>Data</h3>
        </div>
        <div className="data-action-buttons">
          <button
            type="button"
            className="data-action-btn"
            onClick={onExportData}
            disabled={isDataOperationLoading}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" className="menu-icon">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Export Data
          </button>
          <button
            type="button"
            className="data-action-btn"
            onClick={onImportData}
            disabled={isDataOperationLoading}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" className="menu-icon">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            Import Data
          </button>
        </div>
      </section>
    </aside>
  )
}

export default SideMenu
