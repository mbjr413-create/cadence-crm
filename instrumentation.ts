export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    
    if ((global as any).backgroundWorkerStarted) return;
    (global as any).backgroundWorkerStarted = true;

    console.log("🚀 Background Worker Started. Syncing inbox, follow-ups, and Google Sheets...");

    setInterval(async () => {
      try {
        const port = process.env.PORT || 3000;
        
        // 1. Sync Inbox
        const syncRes = await fetch(`http://localhost:${port}/api/sync`, { method: 'POST' });
        const syncData = await syncRes.json();
        if (syncData.success && syncData.count > 0) {
          console.log(`📥 Background Worker synced ${syncData.count} new replies!`);
        }

        // 2. Run Follow-ups
        const followRes = await fetch(`http://localhost:${port}/api/follow-up`, { method: 'POST' });
        const followData = await followRes.json();
        if (followData.success && followData.count > 0) {
          console.log(`🤖 Background Worker auto-sent ${followData.count} follow-up(s)!`);
        }

        // 3. Sync to Google Sheets
        const sheetsRes = await fetch(`http://localhost:${port}/api/sync-sheets`, { method: 'POST' });
        const sheetsData = await sheetsRes.json();
        if (sheetsData.success && sheetsData.message !== "No changes") {
          console.log(`📊 Synced ${sheetsData.count || 0} rows to Google Sheets!`);
        }

      } catch (error) {
        // Ignore fetch errors during server restarts
      }
    }, 60000); 
  }
}