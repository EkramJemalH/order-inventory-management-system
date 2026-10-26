export default function HomePage() {
  return (
    <div className="container">
      <header className="header">
        <h1>📦 Order & Inventory Management</h1>
        <p style={{ color: "var(--text-muted)", marginTop: "0.5rem" }}>
          Modular monorepo with Next.js, Elysia + Bun, and PostgreSQL.
        </p>
      </header>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "1.5rem" }}>
        <div className="card">
          <span className="badge">Frontend</span>
          <h2 style={{ margin: "0.75rem 0" }}>Next.js 15 Client</h2>
          <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
            TypeScript App Router, plain CSS components, shared type safety with Zod schemas.
          </p>
        </div>

        <div className="card">
          <span className="badge" style={{ backgroundColor: "#8b5cf6" }}>Backend</span>
          <h2 style={{ margin: "0.75rem 0" }}>Elysia + Bun API</h2>
          <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
            Ultra-fast Bun runtime, OpenAPI / Swagger docs at <code>/docs</code>, modular controllers for orders and products.
          </p>
        </div>

        <div className="card">
          <span className="badge" style={{ backgroundColor: "#10b981" }}>Database</span>
          <h2 style={{ margin: "0.75rem 0" }}>Drizzle + PostgreSQL</h2>
          <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
            Fully typed PostgreSQL schema, migrations with drizzle-kit, Docker-ready database container.
          </p>
        </div>
      </section>
    </div>
  );
}
