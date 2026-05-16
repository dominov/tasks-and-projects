import { FormEvent, useState } from 'react'

interface CreateProjectViewProps {
  onCreateProject: (name: string, color: string) => Promise<void>
}

function CreateProjectView({ onCreateProject }: CreateProjectViewProps) {
  const [name, setName] = useState('')
  const [color, setColor] = useState('#2563eb')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()

    const trimmedName = name.trim()

    if (!trimmedName || isSubmitting) {
      return
    }

    setIsSubmitting(true)

    try {
      await onCreateProject(trimmedName, color)
      setName('')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="view-card create-entity-view">
      <header className="view-head">
        <h2>Create Project</h2>
        <p>Add a project with its own display color for better organization.</p>
      </header>

      <form className="entity-form" onSubmit={handleSubmit}>
        <label className="entity-field">
          <span>Project name</span>
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Mobile Redesign"
            maxLength={80}
            required
          />
        </label>

        <label className="entity-field entity-field--color">
          <span>Color</span>
          <input type="color" value={color} onChange={(event) => setColor(event.target.value)} />
        </label>

        <button className="entity-submit" type="submit" disabled={isSubmitting || !name.trim()}>
          {isSubmitting ? 'Creating...' : 'Create Project'}
        </button>
      </form>
    </section>
  )
}

export default CreateProjectView
