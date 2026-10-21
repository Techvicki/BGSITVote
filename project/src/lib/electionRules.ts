export type ElectionRuleCategory = 'Campaigning' | 'Conduct' | 'Finance' | 'Eligibility' | 'General';

export type ElectionRulePenalty = 'Disqualification' | 'Immediate Disqualification of Slate' | 'Suspension' | 'Official Warning';

export type ElectionRule = {
  id: string;
  rule_number: number;
  title: string;
  category: ElectionRuleCategory;
  description: string;
  penalty: ElectionRulePenalty;
  created_at: string;
};

export type CandidateMeta = {
  party?: string;
  symbol?: string;
  symbol_description?: string;
  intro?: string;
  branch?: string;
  isDisqualified?: boolean;
  disqualificationReason?: string;
  disqualifiedRule?: string;
  disqualifiedAt?: string;
  disqualifiedBy?: string;
  disqualifiedParty?: boolean;
};

export const DEFAULT_ELECTION_RULES: Omit<ElectionRule, 'id' | 'created_at'>[] = [
  {
    rule_number: 1,
    title: 'Code of Conduct & Non-Defamation',
    category: 'Conduct',
    description: 'No candidate or campaign volunteer shall engage in hate speech, personal defamation, religious or caste-based appeals, or intimidation of fellow students.',
    penalty: 'Immediate Disqualification of Slate',
  },
  {
    rule_number: 2,
    title: 'Campaign Silence Period (48h Pre-Poll)',
    category: 'Campaigning',
    description: 'All public rallies, pamphlet distributions, social media sponsored ads, and canvassing must cease strictly 48 hours prior to the voting opening time.',
    penalty: 'Disqualification',
  },
  {
    rule_number: 3,
    title: 'Prohibition of Inducements & Bribery',
    category: 'Finance',
    description: 'Distribution of cash, food coupons, merchandise, gifts, or promises of personal favor to voters is strictly prohibited.',
    penalty: 'Disqualification',
  },
  {
    rule_number: 4,
    title: 'Campus Defacement & Poster Policy',
    category: 'Campaigning',
    description: 'Posters and campaign material are permitted only on designated institutional bulletin boards. Pasting on walls, classrooms, or labs is forbidden.',
    penalty: 'Official Warning',
  },
  {
    rule_number: 5,
    title: 'Spending Limit & Audit Compliance',
    category: 'Finance',
    description: 'Maximum campaign expenditure per candidate is capped at ₹5,000. All campaign receipts must be submitted to the Faculty Election Board.',
    penalty: 'Disqualification',
  },
  {
    rule_number: 6,
    title: 'Academic Standing & Attendance',
    category: 'Eligibility',
    description: 'All contesting candidates must maintain a minimum of 75% attendance and have no active disciplinary or academic malpractice charges.',
    penalty: 'Disqualification',
  },
];

const RULES_DELIMITER_START = '---ELECTION_RULES_JSON---';
const RULES_DELIMITER_END = '---ELECTION_RULES_END---';

export function parseElectionRules(
  rawInstructions: string | null | undefined,
  electionId: string
): { cleanInstructions: string; rules: ElectionRule[] } {
  const text = rawInstructions ?? '';
  let cleanInstructions = text;
  let rules: ElectionRule[] = [];

  const startIdx = text.indexOf(RULES_DELIMITER_START);
  const endIdx = text.indexOf(RULES_DELIMITER_END);

  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    const jsonStr = text.substring(startIdx + RULES_DELIMITER_START.length, endIdx).trim();
    cleanInstructions = (text.substring(0, startIdx) + text.substring(endIdx + RULES_DELIMITER_END.length)).trim();
    try {
      rules = JSON.parse(jsonStr);
    } catch {
      // Fallback
    }
  }

  // If none found in DB instructions, check localStorage cache
  if (rules.length === 0 && electionId) {
    const local = getElectionRulesLocally(electionId);
    if (local && local.length > 0) {
      rules = local;
    }
  }

  return { cleanInstructions, rules };
}

export function serializeElectionRules(cleanInstructions: string, rules: ElectionRule[]): string {
  const jsonStr = JSON.stringify(rules);
  const trimmed = cleanInstructions.trim();
  return `${trimmed}\n\n${RULES_DELIMITER_START}\n${jsonStr}\n${RULES_DELIMITER_END}`;
}

export function saveElectionRulesLocally(electionId: string, rules: ElectionRule[]): void {
  try {
    localStorage.setItem(`campusvote_rules_${electionId}`, JSON.stringify(rules));
  } catch {
    // Ignore storage quota
  }
}

export function getElectionRulesLocally(electionId: string): ElectionRule[] {
  try {
    const stored = localStorage.getItem(`campusvote_rules_${electionId}`);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

const META_DELIMITER_START = '---CANDIDATE_META_JSON---';
const META_DELIMITER_END = '---CANDIDATE_META_END---';

export function parseCandidateManifesto(rawManifesto: string | null | undefined): {
  cleanManifesto: string;
  meta: CandidateMeta;
} {
  const text = rawManifesto ?? '';
  let cleanManifesto = text;
  let meta: CandidateMeta = {};

  const startIdx = text.indexOf(META_DELIMITER_START);
  const endIdx = text.indexOf(META_DELIMITER_END);

  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    const jsonStr = text.substring(startIdx + META_DELIMITER_START.length, endIdx).trim();
    cleanManifesto = (text.substring(0, startIdx) + text.substring(endIdx + META_DELIMITER_END.length)).trim();
    try {
      meta = JSON.parse(jsonStr);
    } catch {
      meta = {};
    }
  }

  return { cleanManifesto, meta };
}

export function serializeCandidateManifesto(cleanManifesto: string, meta: CandidateMeta): string {
  const jsonStr = JSON.stringify(meta);
  const trimmed = cleanManifesto.trim();
  return `${META_DELIMITER_START}\n${jsonStr}\n${META_DELIMITER_END}\n${trimmed}`;
}

/**
 * Resizes and compresses an image into a base64 Data URL
 */
export function compressImageFile(file: File, maxWidth = 300, maxHeight = 300, quality = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(reader.result as string);
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(dataUrl);
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
}
