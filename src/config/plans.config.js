const PLAN_TIERS = {
  starter: {
    label: 'Starter',
    max_orders_month: 500,
    max_api_keys: 5,
    max_users: 10,
    max_webhooks: 3,
    max_prestadores: 1000,
    max_nomencladores: 2000,
    features: ['basic_ocr', 'pre_visacion'],
  },
  professional: {
    label: 'Professional',
    max_orders_month: 5000,
    max_api_keys: 20,
    max_users: 50,
    max_webhooks: 10,
    max_prestadores: 10000,
    max_nomencladores: 20000,
    features: ['basic_ocr', 'pre_visacion', 'auto_training', 'custom_model'],
  },
  enterprise: {
    label: 'Enterprise',
    max_orders_month: -1,
    max_api_keys: -1,
    max_users: -1,
    max_webhooks: -1,
    max_prestadores: -1,
    max_nomencladores: -1,
    features: ['basic_ocr', 'pre_visacion', 'auto_training', 'custom_model', 'priority_support', 'sla'],
  },
};

function getPlanDefaults(planName) {
  return PLAN_TIERS[planName] || PLAN_TIERS.starter;
}

function isFeatureAllowed(planName, feature) {
  const plan = PLAN_TIERS[planName] || PLAN_TIERS.starter;
  return plan.features.includes(feature);
}

function isWithinLimit(planLimit, currentCount) {
  if (planLimit === -1) return true;
  return currentCount < planLimit;
}

module.exports = { PLAN_TIERS, getPlanDefaults, isFeatureAllowed, isWithinLimit };
