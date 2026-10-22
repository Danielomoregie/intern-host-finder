export const postIdentity = url => {
  const parsed = new URL(url);
  const activity = parsed.pathname.match(/(?:activity-|share-|activity:)(\d+)/)?.[1];
  return activity ? `linkedin-activity:${activity}` : parsed.origin + parsed.pathname.replace(/\/$/, '');
};

export const formatEligibility = lead => {
  const eligibility = lead.eligibility ?? '';
  return /\bbs\b|\bms\b|bachelor|master|\bbsc\b|\bmsc\b|ph\.?d|doctoral|degree eligibility unconfirmed/i.test(eligibility)
    ? eligibility : `${eligibility} · degree eligibility unconfirmed`;
};

// Employer evidence is a display requirement; historical screenshot evidence is valid
// for display without implying an open role or fresh original-post verification.
export const isGoogleEmployeeForDisplay = lead =>
  typeof lead.employer === 'string' && lead.employer.trim().toLowerCase() === 'google'
  && typeof lead.employerEvidence === 'string' && lead.employerEvidence.trim().length > 0
  && typeof lead.employerEvidenceSource === 'string' && lead.employerEvidenceSource.trim().length > 0;

export const partitionByEmployer = records => ({
  leads: records.filter(isGoogleEmployeeForDisplay),
  rejectionHistory: records.filter(lead => !isGoogleEmployeeForDisplay(lead))
});

export const isQualifyingHost = (lead, now = new Date()) => {
  if (!isGoogleEmployeeForDisplay(lead)) return false;
  const text = value => typeof value === 'string' && value.trim().length > 0;
  if (lead.hostCountry !== 'US' || lead.projectCountry !== 'US' || !text(lead.locationEvidence)) return false;
  let url;
  try { url = new URL(lead.url); } catch { return false; }
  const originalPermalink = /(^|\.)linkedin\.com$/i.test(url.hostname)
    && url.protocol === 'https:'
    && (/^\/posts\/.+-(?:activity|share)-\d+/.test(url.pathname)
      || /^\/feed\/update\/urn:li:activity:\d+/.test(url.pathname));
  if (!originalPermalink || !/^open(?:\b|$)/i.test(lead.status ?? '')
    || /closed|filled|withdrawn|excluded|no longer accepting/i.test(lead.status ?? '')) return false;
  let ageDays;
  if (lead.publishedAt) ageDays = (now - new Date(lead.publishedAt)) / 86400000;
  else if (Number.isFinite(lead.ageDaysWhenObserved) && lead.ageObservedAt) {
    const sinceObservation = (now - new Date(lead.ageObservedAt)) / 86400000;
    if (sinceObservation < 0) return false;
    ageDays = lead.ageDaysWhenObserved + sinceObservation;
  }
  return Number.isFinite(ageDays) && ageDays >= 0 && ageDays < 7
    && /summer\s+2027/i.test(lead.eligibility ?? '')
    && lead.phdOnly !== true && lead.researchOnly !== true
    && !/ph\.?d[ -]*only|doctoral[ -]*only|research[ -]*only/i.test(lead.eligibility ?? '')
    && lead.googleAffiliationVerified === true && text(lead.googleAffiliationEvidence)
    && text(lead.teamProject) && text(lead.teamProjectEvidence)
    && lead.softwareInternship === true && text(lead.softwareInternshipEvidence)
    && ((lead.internshipPipeline === 'SWE' && text(lead.internshipPipelineEvidence))
      || (lead.sweMatchingPoolExplicitlyAccepted === true && text(lead.sweMatchingPoolEvidence)))
    && text(lead.directContact) && text(lead.directContactEvidence)
    && lead.originalPostVerified === true && lead.closureChecked === true
    && text(lead.closureEvidence) && text(lead.checkedAt);
};
