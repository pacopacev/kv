// src/index.js
import { Client } from "pg";

function getTime() {
  return new Date().toLocaleString("bg-BG", {
    timeZone: "Europe/Sofia",
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const param = url.searchParams.get("param");
    const path = url.pathname;

    // Get API keys from environment
    const apiKey = env.API_KEY;
    const secretToken = env.SECRET_TOKEN;

    // --- Helper function to validate API key ---
    function validateApiKey(request) {
  // 1. Check Authorization header
  const authHeader = request.headers.get("Authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.replace("Bearer ", "");
    if (token === apiKey) {
      return { valid: true, method: "header" };
    }
  }
  
  // 2. Check query parameter (optional, for local testing)
  const url = new URL(request.url);
  const queryKey = url.searchParams.get("api_key");
  if (queryKey === apiKey) {
    return { valid: true, method: "query" };
  }
  
  // 3. ❌ No valid credentials found → reject
  return { valid: false }; // ⬅️ This is the critical line
}
// --- KV: GET RAW (no JSON parsing) ---
if (path === "/kv/get-raw") {
  const auth = validateApiKey(request);
  if (!auth.valid) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  if (!param) {
    return new Response(
      JSON.stringify({ error: "Missing 'param' parameter" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    // Get raw value (as plain text, no JSON parsing)
    const rawData = await env.KV_BINDING.get(param);
    
    // Get all keys to see what's available
    const allKeys = await env.KV_BINDING.list();
    const keyNames = allKeys.keys.map(k => k.name);
    
    return new Response(
      JSON.stringify({
        keyRequested: param,
        rawValue: rawData,
        valueType: typeof rawData,
        isNull: rawData === null,
        allKeys: keyNames,
        totalKeys: keyNames.length
      }, null, 2),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error.message
      }),
      { 
        status: 500,
        headers: { "Content-Type": "application/json" }
      }
    );
  }
}
    // --- TEST HYPERDRIVE ---
    if (path === "/dbelo") {
      // ✅ Add API key validation
      const auth = validateApiKey(request);
      if (!auth.valid) {
        return new Response(
          JSON.stringify({
            error: "Unauthorized",
            message: "Valid API key required. Use: ?api_key=your-key or Authorization: Bearer your-key"
          }),
          { 
            status: 401,
            headers: { "Content-Type": "application/json" }
          }
        );
      }

      // Check if Hyperdrive binding exists
      if (!env.HYPERDRIVE) {
        return new Response(
          JSON.stringify({
            error: "HYPERDRIVE binding not found",
            availableBindings: Object.keys(env)
          }),
          { 
            status: 500,
            headers: { "Content-Type": "application/json" }
          }
        );
      }

      try {
        // Create a PostgreSQL client with Hyperdrive connection string
        const client = new Client({
          connectionString: env.HYPERDRIVE.connectionString
        });
        
        await client.connect();
        
        // Test query
        // const result = await client.query("SELECT NOW() as current_time, version() as pg_version");
        
        const result = await client.query("SELECT * from products");
        await client.end();

        return new Response(
          JSON.stringify({
            success: true,
            products: result.rows,
            message: "✅ Hyperdrive connection successful!",
            hyperdriveId: env.HYPERDRIVE.connectionString.split('@')[1]?.split('/')[0] || 'connected'
          }),
          { 
            status: 200,
            headers: { "Content-Type": "application/json" }
          }
        );
      } catch (error) {
        return new Response(
          JSON.stringify({
            success: false,
            error: error.message,
            details: "Check your database credentials and network connectivity",
            hint: "Make sure your Aiven database allows connections from Cloudflare IPs"
          }),
          { 
            status: 500,
            headers: { "Content-Type": "application/json" }
          }
        );
      }
    }

    // --- Root path ---
    if (path === "/") {
      const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>Cloudflare Worker</title></head>
<body>
    <h1>🚀 Hello from Cloudflare!</h1>
    <p>Current time: ${getTime()}</p>
    <hr>
    <h3>🔐 API Key Status:</h3>
    <ul>
      <li>API_KEY: ${apiKey ? '✅ Set' : '❌ Missing'}</li>
      <li>SECRET_TOKEN: ${secretToken ? '✅ Set' : '❌ Missing'}</li>
    </ul>
    <h3>Available endpoints:</h3>
    <ul>
      <li><a href="/time">/time</a> - Get current time</li>
      <li><a href="/test?param=hello">/test?param=hello</a> - Test with param</li>
      <li><a href="/dbelo?api_key=your-api-key">/dbelo?api_key=your-api-key</a> - Test PostgreSQL connection (requires API key)</li>
      <li><a href="/kv/set">/kv/set</a> - Set data in KV</li>
      <li><a href="/kv/get?param=test1">/kv/get?param=test1</a> - Get data from KV</li>
      <li><a href="/db">/db</a> - Query D1 database</li>
    </ul>
</body>
</html>`;
      return new Response(html, { headers: { "Content-Type": "text/html" } });
    }

    // --- Time endpoint ---
    if (path === "/time") {
      return new Response(JSON.stringify({ time: getTime() }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // --- Test endpoint ---
    if (path === "/test") {
      console.log("Test endpoint called with param:", param);
      return new Response(`Test page with param: ${param || "no param"}`);
    }

    // --- KV: SET ---
    if (path === "/kv/set") {
      // ✅ Add API key validation
      const auth = validateApiKey(request);
      if (!auth.valid) {
        return new Response(
          JSON.stringify({
            error: "Unauthorized",
            message: "Valid API key required"
          }),
          { 
            status: 401,
            headers: { "Content-Type": "application/json" }
          }
        );
      }

      const bigJson = {
        users: [
          { id: 1, name: "Plamen", role: "admin" },
          { id: 2, name: "Ivan", role: "editor" },
          { id: 3, name: "Maria", role: "viewer" },
        ],
        settings: { theme: "dark", notifications: true, language: "bg" },
        meta: { version: 3, updated: Date.now() },
      };

      await env.KV_BINDING.put("test2", JSON.stringify(bigJson));

      return new Response(
        JSON.stringify({ success: true, message: "Data stored in KV!" }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    // --- KV: GET ---
    if (path === "/kv/get") {
      // ✅ Add API key validation
      const auth = validateApiKey(request);
      if (!auth.valid) {
        return new Response(
          JSON.stringify({
            error: "Unauthorized",
            message: "Valid API key required"
          }),
          { 
            status: 401,
            headers: { "Content-Type": "application/json" }
          }
        );
      }

      if (!param) {
        return new Response(
          JSON.stringify({ error: "Missing 'param' parameter" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }
      console.log("Fetching KV key:", param);
      const data = await env.KV_BINDING.get(param, { type: "json" });
      
      if (data === null) {
        console.log(`Key "${param}" not found in KV`);
        return new Response(
          JSON.stringify({ error: `Key "${param}" not found` }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        );
      }

      return new Response(JSON.stringify({ key: param, data }, null, 2), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // --- KV: LIST ---
    if (path === "/kv") {
      // ✅ Add API key validation
      const auth = validateApiKey(request);
      if (!auth.valid) {
        return new Response(
          JSON.stringify({
            error: "Unauthorized",
            message: "Valid API key required"
          }),
          { 
            status: 401,
            headers: { "Content-Type": "application/json" }
          }
        );
      }

      const allKeys = await env.KV_BINDING.list();
      return new Response(
        JSON.stringify({
          keys: allKeys.keys.map(k => k.name),
          totalKeys: allKeys.keys.length
        }, null, 2),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    // --- D1 Database Query ---
    if (path === "/db") {
      // ✅ Add API key validation
      const auth = validateApiKey(request);
      if (!auth.valid) {
        return new Response(
          JSON.stringify({
            error: "Unauthorized",
            message: "Valid API key required"
          }),
          { 
            status: 401,
            headers: { "Content-Type": "application/json" }
          }
        );
      }

      if (!env.DB) {
        return new Response(
          JSON.stringify({ error: "D1 binding 'DB' not configured" }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }

      try {
        const tables = await env.DB.prepare(
          "SELECT name FROM sqlite_master WHERE type='table'"
        ).all();

        return new Response(
          JSON.stringify({
            success: true,
            tables: tables.results,
            database: "cfdb",
            timestamp: getTime()
          }, null, 2),
          { headers: { "Content-Type": "application/json" } }
        );

      } catch (error) {
        return new Response(
          JSON.stringify({ error: "Database query failed", message: error.message }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    // --- 404 ---
    return new Response(
      JSON.stringify({ error: "Not Found", path: path }),
      { status: 404, headers: { "Content-Type": "application/json" } }
    );
  },


    // // The new scheduled handler for Cron Triggers
    // async scheduled(event, env, ctx) {
    //     // This function will be called once every minute.
    //     // The 'event' object contains the scheduled time.
    //     console.log(`🕐 Cron job triggered at: ${new Date(event.scheduledTime).toISOString()}`);

    //   const url = `http://de1.api.radio-browser.info/json/tags`;
    //   const response = await fetch(url);
    //   const data = await response.json();
    //   console.log("Fetched data from API:", data);

    
    // }




};