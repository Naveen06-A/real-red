declare module 'https://deno.land/std@0.168.0/http/server.ts' {
  export function serve(handler: any): any;
}

declare module 'https://esm.sh/@supabase/supabase-js@2' {
  export function createClient(url: string, key: string, options?: any): any;
}

declare var Deno: {
  env: {
    get(key: string): string | undefined;
  };
};