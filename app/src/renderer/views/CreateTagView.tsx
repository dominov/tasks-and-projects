import { FormEvent, useState } from 'react'

interface CreateTagViewProps {
  onCreateTag: (name: string, color: string) => Promise<void>
}

function CreateTagView({ onCreateTag }: CreateTagViewProps) {
  const [name, setName] = useState('')
  const [color, setColor] = useState('#f97316')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()

    const trimmedName = name.trim()

    if (!trimmedName || isSubmitting) {
      return
    }

    setIsSubmitting(true)

    try {
      await onCreateTag(trimmedName, color)
      setName('')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="view-card create-entity-view">
      <header className="view-head">
        <h2>Create Tag</h2>
        <p>Add labels for quick filtering across tasks in all projects.</p>
      </header>

      <form className="entity-form" onSubmit={handleSubmit}>
        <label className="entity-field">
          <span>Tag name</span>
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Urgent"
            maxLength={80}
            required
          />
        </label>

        <label className="entity-field entity-field--color">
          <span>Color</span>
          <input type="color" value={color} onChange={(event) => setColor(event.target.value)} />
        </label>

        <button className="entity-submit" type="submit" disabled={isSubmitting || !name.trim()}>
          {isSubmitting ? 'Creating...' : 'Create Tag'}
        </button>
      </form>
    </section>
  )
}

export default CreateTagView
