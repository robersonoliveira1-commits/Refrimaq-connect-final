import "dotenv/config";
import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());
  app.use((req, res, next) => { console.log(req.method, req.url); next(); });

  // API routes
  app.post("/api/users/create", async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader) return res.status(401).json({ error: "Not authenticated" });

      console.log("ENV VAR VITE_SUPABASE_URL:", process.env.VITE_SUPABASE_URL);
      const supabaseUrl = process.env.VITE_SUPABASE_URL || "";
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
      const anonKey = process.env.VITE_SUPABASE_ANON_KEY || "";

      // Verify caller is admin
      const callerClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user: caller } } = await callerClient.auth.getUser();
      if (!caller) return res.status(401).json({ error: "Invalid token" });

      const adminClient = createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

      const { data: callerProfile } = await adminClient
        .from("user_profiles")
        .select("role")
        .eq("id", caller.id)
        .maybeSingle();

      if (callerProfile?.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { email, password, full_name, phone, role, assigned_day_index } = req.body;
      if (!email || !password || !full_name) {
        return res.status(400).json({ error: "email, password, and full_name are required" });
      }

      const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name, role: role || "technician" },
      });

      if (createError) return res.status(400).json({ error: createError.message });

      await adminClient.from("user_profiles").upsert({
        id: newUser.user.id,
        full_name,
        phone: phone || "",
        role: role || "technician",
        email: email,
        active: true,
        assigned_day_index
      });

      res.status(200).json({ user: { id: newUser.user.id, email: newUser.user.email } });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.post("/api/users/update", async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader) return res.status(401).json({ error: "Not authenticated" });

      console.log("ENV VAR VITE_SUPABASE_URL:", process.env.VITE_SUPABASE_URL);
      const supabaseUrl = process.env.VITE_SUPABASE_URL || "";
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
      const anonKey = process.env.VITE_SUPABASE_ANON_KEY || "";

      const callerClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user: caller } } = await callerClient.auth.getUser();
      if (!caller) return res.status(401).json({ error: "Invalid token" });

      const adminClient = createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

      const { data: callerProfile } = await adminClient
        .from("user_profiles")
        .select("role")
        .eq("id", caller.id)
        .maybeSingle();

      if (callerProfile?.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { user_id, email, password, action } = req.body;
      if (!user_id) return res.status(400).json({ error: "user_id is required" });

      if (action === "delete") {
        const { error: deleteError } = await adminClient.auth.admin.deleteUser(user_id);
        if (deleteError) return res.status(400).json({ error: deleteError.message });
        return res.status(200).json({ success: true });
      }

      const updateData: any = {};
      if (email) { updateData.email = email; updateData.email_confirm = true; }
      if (password) updateData.password = password;

      if (Object.keys(updateData).length > 0) {
        const { error: updateError } = await adminClient.auth.admin.updateUserById(user_id, updateData);
        if (updateError) return res.status(400).json({ error: updateError.message });
        
        if (email) {
          await adminClient.from("user_profiles").update({ email }).eq("id", user_id);
        }
      }

      res.status(200).json({ success: true });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });


  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    
    // Serve static files with cache control
    app.use(express.static(distPath, {
      setHeaders: (res, filepath) => {
        if (path.basename(filepath) === 'index.html') {
          res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
        } else {
          // Static assets like JS and CSS with unique hashes can be cached
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      }
    }));

    app.get(/.*/, (req, res) => {
      // If a static asset (js, css, png, etc.) is missing, return 404 instead of index.html
      if (req.path.match(/\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot|json)$/)) {
        return res.status(404).end();
      }
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
