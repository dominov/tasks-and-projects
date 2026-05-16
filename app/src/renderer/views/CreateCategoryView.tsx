import { FormEvent, useState } from 'react'

interface CreateCategoryViewProps {
  onCreateCategory: (name: string) => Promise<void>
}

function CreateCategoryView({ onCreateCategory }: CreateCategoryViewProps) {
  const [name, setName] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()

    const trimmedName = name.trim()

    if (!trimmedName || isSubmitting) {
      return
    }

    setIsSubmitting(true)

    try {
      await onCreateCategory(trimmedName)
      setName('')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="view-card create-entity-view">
      <header className="view-head">
        <h2>Create Category</h2>
        <p>Group tasks by broad themes like Work, Health, or Personal.</p>
      </header>

      <form className="entity-form" onSubmit={handleSubmit}>
        <label className="entity-field">
          <span>Category name</span>
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Operations"
            maxLength={80}
            required
          />
        </label>

        <button className="entity-submit" type="submit" disabled={isSubmitting || !name.trim()}>
          {isSubmitting ? 'Creating...' : 'Create Category'}
        </button>
      </form>
    </section>
  )
}

export default CreateCategoryView
