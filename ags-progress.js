// ════════════════════════════════════════════════════════════════════════
// PAWS & PANIC — AGS PROGRESS MODULE
// ────────────────────────────────────────────────────────────────────────
// Statistics and Leaderboard integration.
// ════════════════════════════════════════════════════════════════════════

import { sdk } from './auth.js';
import { AGS_CONFIG } from './ags-config.js';
import { UserStatisticApi } from '@accelbyte/sdk-social';
import { LeaderboardDataApi } from '@accelbyte/sdk-leaderboard';
import { UsersApi } from '@accelbyte/sdk-iam';

/**
 * Submits game results to AGS Statistics.
 * @param {{ meters: number, seconds: number, won: boolean }} stats
 */
export async function submitRunResult({ meters, seconds, won }) {
  if (!sdk.getToken()?.access_token) return;

  const statCode = won ? AGS_CONFIG.stats.totalWins : AGS_CONFIG.stats.totalLosses;

  try {
    // We update meters and seconds (max) and win/loss (increment)
    // Using bulk update if supported, or individual calls
    await UserStatisticApi(sdk).updateUserStatItems_v1([
      { statCode: AGS_CONFIG.stats.longestMeters,  value: meters },
      { statCode: AGS_CONFIG.stats.longestSeconds, value: seconds },
      { statCode: statCode, value: 1 }
    ]);
    console.log('[AGS-Progress] Submitted:', { meters, seconds, won });
  } catch (err) {
    console.error('[AGS-Progress] Submission failed:', err);
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

    // Bulk fetch user profiles (displayName)
    const usersApi = UsersApi(sdk);
    const profiles = await Promise.all(
      userIds.map(uid => usersApi.getUser_v3(uid).catch(() => null))
    );

    // Build a map: userId -> displayName
    const nameMap = {};
    profiles.forEach((profile, idx) => {
      if (profile?.data?.displayName) {
        nameMap[userIds[idx]] = profile.data.displayName;
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
  try {
    const [meters, seconds] = await Promise.all([
      LeaderboardDataApi(sdk).getLeaderboardranking_v1(AGS_CONFIG.leaderboards.meters,  { limit }),
      LeaderboardDataApi(sdk).getLeaderboardranking_v1(AGS_CONFIG.leaderboards.seconds, { limit })
    ]);

    const meterData = meters.response?.data?.data || [];
    const secondData = seconds.response?.data?.data || [];

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
