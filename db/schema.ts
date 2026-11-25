import { pgTable, serial, text, timestamp, index } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  username: text().primaryKey(),
  pinHash: text("pin_hash").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const history = pgTable(
  "history",
  {
    id: serial().primaryKey(),
    username: text().notNull().references(() => users.username, { onDelete: "cascade" }),
    type: text().notNull(),
    agent: text(),
    text: text().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("history_username_idx").on(t.username, t.createdAt)]
);
