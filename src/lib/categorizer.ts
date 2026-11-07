// Comprehensive Categorization & Merchant Intelligence Engine

export type CategoryDefinition = {
  name: string;
  subcategories: string[];
  keywords: string[];
  merchants: string[];
  isFixed: boolean;
};

export const CATEGORIES: Record<string, CategoryDefinition> = {
  "Food": {
    name: "Food",
    subcategories: ["Restaurants", "Cafes", "Delivery", "Fast Food", "Bars"],
    keywords: ["restaurant", "cafe", "coffee", "bistro", "bakery", "diner", "pizza", "burger", "bar", "pub", "food", "dining", "eats", "canteen"],
    merchants: ["swiggy", "zomato", "starbucks", "mcdonald", "kfc", "domino", "subway", "burger king", "haldiram", "chaayos", "chai point", "barbeque nation"],
    isFixed: false,
  },
  "Groceries": {
    name: "Groceries",
    subcategories: ["Supermarket", "Fruits & Veg", "Dairy", "Convenience"],
    keywords: ["grocery", "supermarket", "hypermarket", "mart", "provision", "daily needs", "kirana", "milk", "vegetables", "fruits"],
    merchants: ["dmart", "bigbasket", "blinkit", "zepto", "instamart", "reliance fresh", "more retail", "spencer", "natures basket", "dunzo"],
    isFixed: true,
  },
  "Shopping": {
    name: "Shopping",
    subcategories: ["Electronics", "Clothing", "Home", "Footwear", "Beauty"],
    keywords: ["amazon", "flipkart", "myntra", "retail", "store", "apparel", "clothing", "fashion", "mall", "ecommerce", "electronics"],
    merchants: ["amazon", "flipkart", "myntra", "ajio", "nykaa", "tata cliq", "croma", "reliance digital", "ikea", "decathlon", "zara", "h&m"],
    isFixed: false,
  },
  "Transport": {
    name: "Transport",
    subcategories: ["Rideshare", "Public Transit", "Tolls", "Parking"],
    keywords: ["metro", "cab", "taxi", "ride", "auto", "parking", "toll", "fastag", "bus", "train ticket", "transit"],
    merchants: ["uber", "ola", "rapido", "blusmart", "delhi metro", "dmrc", "bmrc", "fastag", "irctc"],
    isFixed: false,
  },
  "Fuel": {
    name: "Fuel",
    subcategories: ["Petrol", "Diesel", "EV Charging", "Gas"],
    keywords: ["fuel", "petrol", "diesel", "gas station", "ev charging", "cng"],
    merchants: ["indian oil", "ioc", "bharat petroleum", "bpcl", "hindustan petroleum", "hpcl", "shell", "reliance petroleum", "ather grid", "tata power ev"],
    isFixed: true,
  },
  "Housing": {
    name: "Housing",
    subcategories: ["Rent", "Maintenance", "Property Tax", "Repairs"],
    keywords: ["rent", "maintenance", "society", "property tax", "housing", "landlord", "apartment", "brokerage"],
    merchants: ["nobroker", "magicbricks", "housing.com", "mygate", "nestaway"],
    isFixed: true,
  },
  "Utilities": {
    name: "Utilities",
    subcategories: ["Electricity", "Water", "Gas", "Broadband", "Mobile"],
    keywords: ["electricity", "water bill", "gas bill", "broadband", "wifi", "internet", "dth", "recharge", "utility"],
    merchants: ["airtel", "jio", "vodafone", "vi", "tata play", "bescom", "mseb", "tneb", "adani electricity", "tatapower", "act fibernet"],
    isFixed: true,
  },
  "Health": {
    name: "Health",
    subcategories: ["Pharmacy", "Doctor", "Diagnostic", "Hospital", "Dental"],
    keywords: ["pharmacy", "medical", "clinic", "hospital", "doctor", "lab", "diagnostic", "medicines", "dentist", "healthcare"],
    merchants: ["apollo", "medplus", "1mg", "pharmeasy", "netmeds", "dr lal pathlabs", "metropolis", "max healthcare", "fortis"],
    isFixed: true,
  },
  "Entertainment": {
    name: "Entertainment",
    subcategories: ["Streaming", "Movies", "Gaming", "Events"],
    keywords: ["movie", "cinema", "theater", "concert", "show", "gaming", "steam", "playstation", "xbox", "music", "video"],
    merchants: ["netflix", "spotify", "prime video", "hotstar", "bookmyshow", "pvr", "inox", "youtube", "apple media", "steam", "playstation"],
    isFixed: false,
  },
  "Education": {
    name: "Education",
    subcategories: ["Courses", "Books", "School Fees", "Tuition"],
    keywords: ["school", "college", "tuition", "course", "udemy", "coursera", "university", "academy", "books", "stationery"],
    merchants: ["udemy", "coursera", "edx", "byju", "unacademy", "simplilearn", "upgrad"],
    isFixed: false,
  },
  "Travel": {
    name: "Travel",
    subcategories: ["Flights", "Hotels", "Vacation", "Car Rental"],
    keywords: ["hotel", "flight", "airline", "resort", "vacation", "trip", "booking", "homestay"],
    merchants: ["makemytrip", "goibibo", "cleartrip", "airbnb", "agoda", "booking.com", "indigo", "air india", "vistara", "spicejet"],
    isFixed: false,
  },
  "Debt": {
    name: "Debt",
    subcategories: ["Home Loan", "Car Loan", "Personal Loan", "Credit Card EMI"],
    keywords: ["credit card", "card bill", "emi", "loan", "repayment", "instalment", "principal", "interest payment", "fintech loan"],
    merchants: ["bajaj finance", "hdfc bank loan", "sbi loan", "icici loan", "cred emi", "tata capital", "kreditbee", "paylater"],
    isFixed: true,
  },
  "Insurance": {
    name: "Insurance",
    subcategories: ["Health Insurance", "Term Life", "Motor Insurance"],
    keywords: ["insurance", "premium", "policy", "lic", "assurance", "life cover"],
    merchants: ["lic", "hdfc ergo", "icici lombard", "star health", "policybazaar", "care health", "tata aig", "acko"],
    isFixed: true,
  },
  "Investments": {
    name: "Investments",
    subcategories: ["Mutual Funds", "Stocks", "SIP", "Gold", "Crypto"],
    keywords: ["mutual fund", "sip", "stocks", "equity", "investment", "bonds", "nps", "ppf", "demat"],
    merchants: ["zerodha", "groww", "upstox", "angel one", "kuvera", "coin", "camsonline", "kfintech", "etmoney", "motilal oswal"],
    isFixed: false,
  },
  "Salary": {
    name: "Salary",
    subcategories: ["Monthly Pay", "Bonus", "Incentive"],
    keywords: ["salary", "payroll", "stipend", "wages", "remuneration", "employer"],
    merchants: ["acme corp", "tcs", "infosys", "wipro", "cognizant", "accenture", "google", "microsoft", "amazon payroll"],
    isFixed: false,
  },
  "Interest": {
    name: "Interest",
    subcategories: ["Savings Interest", "FD Interest", "Dividend"],
    keywords: ["interest cr", "savings interest", "fd interest", "dividend", "int.pd"],
    merchants: ["bank interest", "rbi", "corporate dividend"],
    isFixed: false,
  },
  "Transfers": {
    name: "Transfers",
    subcategories: ["Self Transfer", "Internal", "Credit Card Payment"],
    keywords: ["self transfer", "transfer to own", "to account", "cc payment", "credit card bill", "cred payment", "wallet topup"],
    merchants: ["cred", "paytm wallet", "mobikwik", "amazon pay balance"],
    isFixed: false,
  },
};

export type CategorizationResult = {
  category: string;
  subcategory: string;
  merchant: string;
  confidence: number;
  isTransfer: boolean;
  isIncome: boolean;
};

export function cleanDescription(raw: string): string {
  return raw
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractMerchant(description: string): string {
  const cleaned = cleanDescription(description);

  // Check known merchants first
  const lower = cleaned.toLowerCase();
  for (const cat of Object.values(CATEGORIES)) {
    for (const m of cat.merchants) {
      if (lower.includes(m)) {
        // Return title-cased recognized merchant
        return m.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
      }
    }
  }

  // UPI pattern: UPI/123456/MERCHANT NAME/bank or UPI-MERCHANT-VPA
  const upiMatch = cleaned.match(/UPI(?:-|\/)[^/]+\/([^/]+)/i);
  if (upiMatch && upiMatch[1]) {
    const candidate = upiMatch[1].replace(/@[a-zA-Z0-9.-]+/g, "").replace(/[^a-zA-Z0-9 ]/g, " ").trim();
    if (candidate.length > 2) return candidate;
  }

  // POS / Card pattern: POS XXXXXX MERCHANT NAME CITY
  const posMatch = cleaned.match(/POS\s+\d*\s*([A-Za-z0-9 ]+)/i);
  if (posMatch && posMatch[1]) {
    const candidate = posMatch[1].trim().split(/\s+/).slice(0, 3).join(" ");
    if (candidate.length > 2) return candidate;
  }

  // Clean common transaction prefixes/suffixes
  const stripped = cleaned
    .replace(/\b(UPI|POS|NEFT|IMPS|RTGS|ACH|NACH|INB|BIL|TPT|FT|ATM|WDL|DEP|TXN|CR|DR|REF|CMS|VPA)\b/gi, "")
    .replace(/\b\d{4,}\b/g, "") // Strip account or reference numbers
    .replace(/@[a-zA-Z0-9.-]+/g, "") // Strip VPAs
    .replace(/[^a-zA-Z ]/g, " ")
    .trim();

  const words = stripped.split(/\s+/).filter(w => w.length > 1);
  if (words.length > 0) {
    return words.slice(0, 3).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
  }

  return "General Merchant";
}

export function isTransferTransaction(description: string, categoryName?: string): boolean {
  const lower = description.toLowerCase();
  if (categoryName === "Transfers") return true;
  return (
    /\b(self\s*transfer|transfer\s*to\s*own|own\s*a\/c|sweep|auto-sweep|mod\s*balance|reverse\s*sweep|sweep\s*trf|intra-bank\s*transfer)\b/i.test(lower)
  );
}

export function categorizeTransaction(
  description: string,
  amount: number,
  userRules?: Record<string, string>,
): CategorizationResult {
  const cleaned = cleanDescription(description);
  const lower = cleaned.toLowerCase();
  const merchant = extractMerchant(cleaned);
  const merchantLower = merchant.toLowerCase();

  // User-defined override rules take precedence
  if (userRules) {
    for (const [pattern, userCat] of Object.entries(userRules)) {
      if (lower.includes(pattern.toLowerCase())) {
        return {
          category: userCat,
          subcategory: "User Defined",
          merchant,
          confidence: 0.99,
          isTransfer: userCat === "Transfers",
          isIncome: amount > 0,
        };
      }
    }
  }

  // Check for internal transfers
  if (isTransferTransaction(cleaned)) {
    return {
      category: "Transfers",
      subcategory: lower.includes("credit card") ? "Credit Card Payment" : "Self Transfer",
      merchant,
      confidence: 0.95,
      isTransfer: true,
      isIncome: amount > 0,
    };
  }

  // Check for income/salary patterns
  if (amount > 0) {
    if (/\b(salary|payroll|stipend|wages|remuneration)\b/i.test(lower)) {
      return {
        category: "Salary",
        subcategory: "Monthly Pay",
        merchant,
        confidence: 0.95,
        isTransfer: false,
        isIncome: true,
      };
    }
    if (/\b(interest|dividend|yield)\b/i.test(lower)) {
      return {
        category: "Interest & Dividends",
        subcategory: lower.includes("dividend") ? "Dividend" : "Savings Interest",
        merchant,
        confidence: 0.9,
        isTransfer: false,
        isIncome: true,
      };
    }
    if (/\b(refund|reversal|cashback)\b/i.test(lower)) {
      return {
        category: "Other Income",
        subcategory: "Refund / Reversal",
        merchant,
        confidence: 0.85,
        isTransfer: false,
        isIncome: true,
      };
    }
    return {
      category: "Other Income",
      subcategory: "Direct Deposit",
      merchant,
      confidence: 0.75,
      isTransfer: false,
      isIncome: true,
    };
  }

  // Expense categorization matching
  for (const [catName, def] of Object.entries(CATEGORIES)) {
    // 1. Merchant match (high confidence)
    if (def.merchants.some(m => merchantLower.includes(m) || lower.includes(m))) {
      return {
        category: catName,
        subcategory: def.subcategories[0] ?? "General",
        merchant,
        confidence: 0.94,
        isTransfer: false,
        isIncome: false,
      };
    }

    // 2. Keyword match
    if (def.keywords.some(k => lower.includes(k))) {
      return {
        category: catName,
        subcategory: def.subcategories[0] ?? "General",
        merchant,
        confidence: 0.82,
        isTransfer: false,
        isIncome: false,
      };
    }
  }

  // Default fallback
  return {
    category: "Shopping",
    subcategory: "General Retail",
    merchant,
    confidence: 0.55,
    isTransfer: false,
    isIncome: false,
  };
}
