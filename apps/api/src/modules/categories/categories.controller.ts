import { Elysia, t } from "elysia";
import { db, categories, eq, desc } from "@repo/db";

export const categoriesController = new Elysia({ prefix: "/categories" })
  .get(
    "/",
    async () => {
      const data = await db.select().from(categories).orderBy(desc(categories.createdAt));
      return { success: true, data };
    },
    {
      detail: {
        tags: ["Categories"],
        summary: "List all categories",
      },
    }
  )
  .post(
    "/",
    async ({ body, set }) => {
      try {
        const [newCategory] = await db
          .insert(categories)
          .values({
            name: body.name,
            slug: body.slug,
            description: body.description,
            parentId: body.parentId,
          })
          .returning();

        set.status = 201;
        return { success: true, data: newCategory, message: "Category created successfully" };
      } catch (err: any) {
        set.status = 400;
        return { success: false, error: err.message || "Failed to create category" };
      }
    },
    {
      body: t.Object({
        name: t.String({ minLength: 2, maxLength: 100 }),
        slug: t.String({ minLength: 2, maxLength: 120 }),
        description: t.Optional(t.String()),
        parentId: t.Optional(t.Nullable(t.String())),
      }),
      detail: {
        tags: ["Categories"],
        summary: "Create a new category",
      },
    }
  )
  .get(
    "/:id",
    async ({ params: { id }, set }) => {
      const [category] = await db.select().from(categories).where(eq(categories.id, id));
      if (!category) {
        set.status = 404;
        return { success: false, error: "Category not found" };
      }
      return { success: true, data: category };
    },
    {
      params: t.Object({ id: t.String() }),
      detail: {
        tags: ["Categories"],
        summary: "Get category by ID",
      },
    }
  )
  .patch(
    "/:id",
    async ({ params: { id }, body, set }) => {
      const [updated] = await db
        .update(categories)
        .set({
          ...body,
          updatedAt: new Date(),
        })
        .where(eq(categories.id, id))
        .returning();

      if (!updated) {
        set.status = 404;
        return { success: false, error: "Category not found" };
      }
      return { success: true, data: updated, message: "Category updated successfully" };
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Partial(
        t.Object({
          name: t.String(),
          slug: t.String(),
          description: t.String(),
          parentId: t.Nullable(t.String()),
        })
      ),
      detail: {
        tags: ["Categories"],
        summary: "Update category",
      },
    }
  );
