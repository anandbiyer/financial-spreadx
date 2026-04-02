/**
 * M4 — Hierarchy & Rollup Engine
 *
 * Builds a statement tree from indentation levels and subtotal detection.
 * Validates that child rows sum to their parent subtotals.
 * Infers missing intermediate totals where arithmetic is unambiguous.
 */

export interface TreeRow {
  canonicalField: string;
  rawLabel: string;
  value: number | null;       // value for the primary year
  indentationLevel: number;
  isSubtotal: boolean;
  parentField?: string | null;
  children?: TreeRow[];
  sumValid?: boolean;          // whether children sum matches this subtotal
}

export interface StatementTree {
  rows: TreeRow[];
  missingSubtotals: { canonicalField: string; inferredValue: number }[];
}

/**
 * Build a statement tree by grouping rows according to indentation levels.
 * Subtotal rows (isSubtotal=true) become parent nodes; preceding rows at
 * deeper indentation become their children.
 */
export function buildStatementTree(
  rows: {
    canonicalField: string;
    rawLabel: string;
    value: number | null;
    indentationLevel: number;
    isSubtotal: boolean;
    parentCanonicalField?: string | null;
  }[],
): StatementTree {
  const treeRows: TreeRow[] = [];
  const pendingChildren: TreeRow[] = [];

  for (const row of rows) {
    const treeRow: TreeRow = {
      canonicalField: row.canonicalField,
      rawLabel: row.rawLabel,
      value: row.value,
      indentationLevel: row.indentationLevel,
      isSubtotal: row.isSubtotal,
      parentField: row.parentCanonicalField ?? null,
      children: [],
    };

    if (row.isSubtotal) {
      // Collect all preceding non-subtotal rows at deeper indentation as children
      const children = pendingChildren.splice(0, pendingChildren.length);
      treeRow.children = children;

      // Validate sum
      if (treeRow.value !== null && children.length > 0) {
        const childrenSum = children.reduce((sum, c) => sum + (c.value ?? 0), 0);
        const diff = Math.abs(treeRow.value - childrenSum);
        const tolerance = Math.abs(treeRow.value) * 0.005; // 0.5%
        treeRow.sumValid = diff <= tolerance || treeRow.value === 0;
      }

      treeRows.push(treeRow);
    } else {
      pendingChildren.push(treeRow);
    }
  }

  // Any remaining non-subtotal rows get added as top-level
  treeRows.push(...pendingChildren);

  return { rows: treeRows, missingSubtotals: [] };
}

/**
 * Infer missing subtotals where the arithmetic is unambiguous.
 * e.g., if there are 3 revenue component rows but no total_revenue subtotal,
 * insert one with the sum of components.
 */
export function inferMissingSubtotals(
  tree: StatementTree,
  knownSubtotalFields: string[],
): StatementTree {
  const missingSubtotals: { canonicalField: string; inferredValue: number }[] = [];

  for (const field of knownSubtotalFields) {
    // Check if this subtotal already exists in the tree
    const exists = tree.rows.some((r) => r.canonicalField === field && r.isSubtotal);
    if (exists) continue;

    // Find children that should roll up to this field
    const children = tree.rows.filter(
      (r) => r.parentField === field && !r.isSubtotal && r.value !== null,
    );

    if (children.length >= 2) {
      const sum = children.reduce((acc, c) => acc + (c.value ?? 0), 0);
      missingSubtotals.push({ canonicalField: field, inferredValue: sum });
    }
  }

  return { ...tree, missingSubtotals };
}
