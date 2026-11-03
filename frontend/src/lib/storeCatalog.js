// Store formats (who owns and who runs a store) and store types (its size), with
// the words shown next to the codes. Same lists as GET /api/stores/catalog.
export const STORE_FORMATS = [
  { code: 'COCO', name: 'Company Owned, Company Operated', note: 'The company owns the store and runs it.' },
  { code: 'COFO', name: 'Company Owned, Franchise Operated', note: 'The company owns the store; a franchisee runs it.' },
  { code: 'FOCO', name: 'Franchise Owned, Company Operated', note: 'A franchisee owns the store; the company runs it.' },
  { code: 'FOFO', name: 'Franchise Owned, Franchise Operated', note: 'A franchisee owns the store and runs it.' },
]

export const STORE_TYPES = [
  { code: 'Flagship', note: "The brand's largest showcase store, usually in a prime location, with the full range." },
  { code: 'Standard', note: 'A regular full-size store with the usual range and staffing.' },
  { code: 'Compact', note: 'A smaller store with a reduced range, often in a neighbourhood or high street.' },
  { code: 'Kiosk', note: 'A small counter or stall, for example in a mall or station, with a few lines.' },
]

export const BRAND_CATEGORIES = ['Grocery', 'Fashion', 'Electronics', 'Pharmacy', 'Home & Living', 'Food & Beverage', 'Other']

// "COCO - Company Owned, Company Operated"; unknown codes stay as they are.
export function formatLabel(code) {
  const f = STORE_FORMATS.find((x) => x.code === code)
  return f ? `${f.code} - ${f.name}` : code
}

export const formatNote = (code) => STORE_FORMATS.find((x) => x.code === code)?.note || ''
export const typeNote = (code) => STORE_TYPES.find((x) => x.code === code)?.note || ''
