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
}

const viewMenu: Array<{ id: ViewType; label: string }> = [
  { id: 'today', label: 'Today' },
  { id: 'tasks', label: 'My Tasks' },
  { id: 'goals', label: 'Goals' },
  { id: 'calendar', label: 'Calendar' },
  { id: 'gantt', label: 'Gantt' },
]

function SideMenu({
  viewType,
  projects,

  categories,
  tags,
  showCompletedTasks,
  selectedProjectId,
  selectedTagId,
  selectedCategoryId,
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
              {item.label}
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
              <span className="dot" aria-hidden="true" />
              {project.name}
            </button>
            <button type="button" className="chip-delete" onClick={() => onDeleteProject(project)}>
              Delete
            </button>
          </div>
        ))}
      </section>


      <section className="menu-section">
        <div className="menu-section-title-row">
          <h3>Categories</h3>
          <button type="button" className="mini-add" onClick={onOpenCategoryCreateView}>
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
            <button type="button" className="chip-delete" onClick={() => onDeleteCategory(category)}>
              Delete
            </button>
          </div>
        ))}
      </section>
      
      <section className="menu-section">
        <div className="menu-section-title-row">
          <h3>Tags</h3>
          <button type="button" className="mini-add" onClick={onOpenTagCreateView}>
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
              <span className="dot" aria-hidden="true" />
              {tag.name}
            </button>
            <button type="button" className="chip-delete" onClick={() => onDeleteTag(tag)}>
              Delete
            </button>
          </div>
        ))}
      </section>
    </aside>
  )
}

export default SideMenu
