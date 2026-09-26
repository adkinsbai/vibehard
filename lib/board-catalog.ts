export type BoardResource = { section: string; name: string; path: string };
export type CatalogBoard = { name: string; category: string; size: string; features: string[]; resources: BoardResource[] };

export function canReadBoardCatalog(role?: string | null) {
  return role === "admin" || role === "developer";
}

export function catalogFacets(boards: CatalogBoard[]) {
  const categories = new Map<string, number>();
  const features = new Map<string, number>();
  for (const board of boards) {
    categories.set(board.category, (categories.get(board.category) ?? 0) + 1);
    for (const feature of new Set(board.features)) features.set(feature, (features.get(feature) ?? 0) + 1);
  }
  return { categories: [...categories], features: [...features].sort((a, b) => b[1] - a[1]) };
}

export function filterBoards(boards: CatalogBoard[], query: string, category: string, features: string[]) {
  const needle = query.trim().toLocaleLowerCase();
  return boards.filter(board => (!category || board.category === category)
    && features.every(feature => board.features.includes(feature))
    && `${board.name} ${board.category} ${board.features.join(" ")}`.toLocaleLowerCase().includes(needle));
}
