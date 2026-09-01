// Sets a user's password locally through the Supabase admin API.
// Run: npm run set-password
// Prompts in the terminal with hidden input; the password is never
// printed, logged or stored anywhere.
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { createInterface } from "node:readline";
import { Writable } from "node:stream";

config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

function ask(question: string, hidden: boolean): Promise<string> {
  const muted = new Writable({
    write(chunk, _enc, cb) {
      if (!hidden) process.stdout.write(chunk);
      cb();
    },
  });
  const rl = createInterface({ input: process.stdin, output: muted, terminal: true });
  process.stdout.write(question);
  return new Promise((resolve) => {
    rl.question("", (answer) => {
      rl.close();
      if (hidden) process.stdout.write("\n");
      resolve(answer.trim());
    });
  });
}

async function main() {
  const email = (await ask("Email (blank for tarun.s@lapizblue.com): ", false)) || "tarun.s@lapizblue.com";
  const password = await ask("New password (hidden): ", true);
  if (password.length < 10) {
    console.error("Use at least 10 characters.");
    process.exit(1);
  }
  const confirm = await ask("Repeat it (hidden): ", true);
  if (password !== confirm) {
    console.error("Passwords do not match. Nothing changed.");
    process.exit(1);
  }

  const { data, error: listErr } = await supabase.auth.admin.listUsers();
  if (listErr) {
    console.error(listErr.message);
    process.exit(1);
  }
  const user = data.users.find((u) => u.email === email);
  if (!user) {
    console.error(`No user with email ${email}`);
    process.exit(1);
  }
  const { error } = await supabase.auth.admin.updateUserById(user.id, { password });
  if (error) {
    console.error(error.message);
    process.exit(1);
  }
  console.log(`Password updated for ${email}. Old password no longer works.`);
}

main();
