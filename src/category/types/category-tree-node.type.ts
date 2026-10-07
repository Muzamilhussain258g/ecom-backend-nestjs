export interface CategorySummary {
  id: number;
  categoryName: string;
  slug: string;
  parentId: number | null;
  productCount: number;
}

export interface CategoryTreeNode extends CategorySummary {
  children: CategoryTreeNode[];
}

export interface CategoryQueryNode {
  id: number;
  categoryName: string;
  slug: string;
  parentId: number | null;
  // _count: {
  //   productCategories: number;
  // };
  children?: CategoryQueryNode[];
}
