import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://jfewbbhvosrmzqinmads.supabase.co";
const supabaseAnonKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpmZXdiYmh2b3NybXpxaW5tYWRzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5ODgzNDgsImV4cCI6MjA4NzU2NDM0OH0.aYbMUlaLBUk9AjgTAnUoPXCAjAjp8FpTK_NtStq6G8k";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
