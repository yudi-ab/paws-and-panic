// ════════════════════════════════════════════════════════════════════════
// PAWS & PANIC — AGS PROGRESS MODULE
// ────────────────────────────────────────────────────────────────────────
// Statistics and Leaderboard integration.
// ════════════════════════════════════════════════════════════════════════

import { sdk } from './auth.js';
import { AGS_CONFIG } from './ags-config.js';
import { UserStatisticApi } from '@accelbyte/sdk-social';
import { LeaderboardDataV3Api } from '@accelbyte/sdk-leaderboard';
import { UsersApi } from '@accelbyte/sdk-iam';

/**
 * Submits game results to AGS Statistics.
 * @param {{ meters: number, seconds: number, won: boolean }} stats
 */
export async function submitRunResult({ meters, seconds, won }) {
  console.log('[DEBUG] submitRunResult() called with:', { meters, seconds, won });
  const token = sdk.getToken();
  console.log('[DEBUG] Token:', token);

  let userId = null;

  // Try to get userId from token properties first
  userId = token?.user_id || token?.sub || token?.userId;

  // If not found, try to extract from JWT accessToken
  if (!userId && token?.accessToken) {
    try {
      // Decode JWT payload (second part)
      const payloadBase64 = token.accessToken.split('.')[1];
      // Add padding if needed
      const padded = payloadBase64.replace(/-/g, '+').replace(/_/g, '/');
      const payload = JSON.parse(atob(padded));
      userId = payload?.sub || payload?.user_id || payload?.userId || payload?.user?.id;
      console.log('[DEBUG] Extracted userId from JWT payload:', userId);
    } catch (e) {
      console.log('[DEBUG] Could not parse JWT for userId:', e);
    }
  }

  // Try other possible locations
  if (!userId) {
    userId = token?.user?.id || token?.user?.userId || token?.profile?.userId;
  }

  console.log('[DEBUG] Final extracted userId:', userId);

  if (!userId) {
    console.log('[DEBUG] NO USERID - returning early');
    return;
  }

  const statCode = won ? AGS_CONFIG.stats.totalWins : AGS_CONFIG.stats.totalLosses;
  console.log('[DEBUG] StatCode for win/loss:', statCode);
  console.log('[DEBUG] About to call UserStatisticApi.updateStatitemValueBulk_ByUserId_v2');

  try {
    const result = await UserStatisticApi(sdk).updateStatitemValueBulk_ByUserId_v2(userId, [
      { statCode: AGS_CONFIG.stats.longestMeters,  value: meters,  updateStrategy: 'MAX' },
      { statCode: AGS_CONFIG.stats.longestSeconds, value: seconds, updateStrategy: 'MAX' },
      { statCode: statCode,                         value: 1,       updateStrategy: 'INCREMENT' }
    ]);
    console.log('[DEBUG] API call succeeded. Response:', result);
    console.log('[AGS-Progress] Submitted stats for user', userId, ':', { meters, seconds, won });
  } catch (err) {
    console.error('[AGS-Progress] Submission failed:', err);
    console.error('[DEBUG] Full error:', err?.response?.data || err);
  }
}

/**
 * Enriches leaderboard entries with display names from IAM.
 * @param {Array} entries - Raw leaderboard entries (with userId and value)
 * @returns {Promise<Array>} Enriched entries with displayName
 */
async function enrichLeaderboardWithNames(entries) {
  if (!entries || entries.length === 0) return entries;

  try {
    // Collect unique user IDs
    const userIds = [...new Set(entries.map(e => e.userId).filter(Boolean))];
    if (userIds.length === 0) return entries;

    // Bulk fetch public user profiles in one request
    const usersApi = UsersApi(sdk);
    const bulkRes = await usersApi.createUserBulkBasic_v3({ userIds }).catch(() => null);
    const userList = bulkRes?.data?.data || [];

    // Build a map: userId -> displayName
    const nameMap = {};
    userList.forEach(u => {
      const name = u?.displayName || u?.userName || u?.uniqueDisplayName;
      if (u?.userId && name) {
        nameMap[u.userId] = name;
      }
    });

    // Enrich entries
    return entries.map(entry => ({
      ...entry,
      displayName: nameMap[entry.userId] || entry.userId || 'Anonymous'
    }));
  } catch (err) {
    console.error('[AGS-Progress] Name enrichment failed:', err);
    // Return entries as-is if enrichment fails
    return entries.map(e => ({
      ...e,
      displayName: e.userId || 'Anonymous'
    }));
  }
}

/**
 * Fetches rankings for both meters and seconds, enriched with display names.
 */
export async function fetchLongestRunLeaderboards(limit = 10) {
  const fetchBoard = async (code) => {
    try {
      const res = await LeaderboardDataV3Api(sdk).getAlltime_ByLeaderboardCode_v3(code, { limit });
      const entries = res.data?.data || [];
      return entries;
    } catch (err) {
      // AGS returns 404 (error 71235) when a leaderboard has no submitted entries yet
      if (err.response?.status === 404 || err.status === 404) {
        return [];
      }
      console.error(`[AGS-Progress] Leaderboard fetch failed for ${code}:`, err);
      return [];
    }
  };

  try {
    const [meterData, secondData] = await Promise.all([
      fetchBoard(AGS_CONFIG.leaderboards.meters),
      fetchBoard(AGS_CONFIG.leaderboards.seconds)
    ]);

    // Enrich both with display names
    const [enrichedMeters, enrichedSeconds] = await Promise.all([
      enrichLeaderboardWithNames(meterData),
      enrichLeaderboardWithNames(secondData)
    ]);

    return {
      meters: enrichedMeters,
      seconds: enrichedSeconds
    };
  } catch (err) {
    console.error('[AGS-Progress] Leaderboard fetch failed:', err);
    return { meters: [], seconds: [] };
  }
}
