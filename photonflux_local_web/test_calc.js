const TARGET_MIX_TOTAL = 1000;
const P_from_P2O5 = 0.4365, K_from_K2O = 0.8301, S_from_SO3 = 0.4;
const MKP_P2O5 = 0.52, MKP_K2O = 0.34, MAP_N = 0.12, MAP_P2O5 = 0.61, KNO3_N = 0.13, KNO3_K2O = 0.46, SOP_K2O = 0.50, SOP_SO3 = 0.45, EPSOM_Mg = 0.0981, EPSOM_S = 0.1222;
const MMX = {Fe:0.078,Mn:0.026,Zn:0.013,Cu:0.005,B:0.007,Mo:0.0032}, FeEDTA_Fe=0.13, H3BO3_B=0.1749, Na2MoO4_Mo=0.396;

const VECTOR_RECIPE_RAW = {
  MgSO4: 240.8,
  K2SO4: 232.4,
  KNO3: 4.8,
  MKP: 126.8,
  MAP: 342.2,
  MMX: 40.1,
  FeEDTA: 8.0,
  H3BO3: 4.6,
  Na2MoO4: 0.2,
};

const VECTOR_NORMALIZATION = 1.0563;

function normalizeRecipe(raw, scale, target = TARGET_MIX_TOTAL) {
  const normalized = {};
  let total = 0;
  for (const salt of Object.keys(raw)) {
    const grams = (raw[salt] || 0) * scale;
    if (Number.isFinite(grams) && grams > 0) {
      normalized[salt] = grams;
      total += grams;
    } else {
      normalized[salt] = 0;
    }
  }
  if (!total) return normalized;
  const adjust = target / total;
  for (const salt of Object.keys(normalized)) {
    normalized[salt] = normalized[salt] * adjust;
  }
  return normalized;
}

function sharesFromNormalized(normalized, target = TARGET_MIX_TOTAL) {
  const shares = {};
  const divisor = target || 1;
  for (const salt of Object.keys(normalized)) {
    shares[salt] = (normalized[salt] || 0) / divisor;
  }
  return shares;
}

function profileFromRecipe(rec) {
  const o = {N:0,P:0,K:0,Ca:0,Mg:0,S:0,Na:0,Fe:0,B:0,Mo:0,Mn:0,Zn:0,Cu:0,Cl:0};
  const g = sharesFromNormalized(rec);
  console.log('Shares:', g);

  if(g.MgSO4){ o.Mg+=g.MgSO4*EPSOM_Mg*1000; o.S+=g.MgSO4*EPSOM_S*1000; }
  if(g.K2SO4){ o.K +=g.K2SO4*SOP_K2O*K_from_K2O*1000; o.S+=g.K2SO4*SOP_SO3*S_from_SO3*1000; }
  if(g.KNO3){ o.N +=g.KNO3*KNO3_N*1000; o.K+=g.KNO3*KNO3_K2O*K_from_K2O*1000; }
  if(g.MKP){  o.P +=g.MKP*MKP_P2O5*P_from_P2O5*1000; o.K+=g.MKP*MKP_K2O*K_from_K2O*1000; }
  if(g.MAP){  o.N +=g.MAP*MAP_N*1000; o.P+=g.MAP*MAP_P2O5*P_from_P2O5*1000; }
  // ... omitting others for brevity
  return o;
}

const B_REC = normalizeRecipe(VECTOR_RECIPE_RAW, VECTOR_NORMALIZATION);
const PROF_B = profileFromRecipe(B_REC);
console.log('PROF_B:', PROF_B);
