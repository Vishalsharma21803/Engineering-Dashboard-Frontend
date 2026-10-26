/** Page numbers to show: first, last, current ±1, with gaps marked by null. */
export function pageWindow(page: number, totalPages: number): Array<number | null> {
  const pages = new Set([1, totalPages, page - 1, page, page + 1].filter((value) => value >= 1 && value <= totalPages));
  const sorted = [...pages].sort((a, b) => a - b);
  const result: Array<number | null> = [];

  sorted.forEach((value, index) => {
    const previous = sorted[index - 1];

    if (previous !== undefined && value - previous > 1) {
      result.push(null);
    }

    result.push(value);
  });

  return result;
}
