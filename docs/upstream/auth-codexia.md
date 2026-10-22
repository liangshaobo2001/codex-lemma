# auth for codexia

get supabase for auth login

```
# .env
VITE_SUPABASE_URL=https://example.supabase.co
VITE_SUPABASE_ANON_KEY=eyb...
VITE_REDIRECT_URL=http://localhost:1420/auth-success
```

## VITE_REDIRECT_URL

### Next.js

```sh
next dev # command to run server http://localhost:1420 or other
```

page.tsx

```js
"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";

function CallbackContent() {
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams) {
      const query = searchParams.toString();
      const deepLinkUrl = `codexia://auth/callback?${query}`;
      window.location.href = deepLinkUrl;
    }
  }, [searchParams]);

  return (
    <div style={{ maxWidth: 600, margin: "100px auto", padding: 16 }}>
      login success, you can close this page now.
    </div>
  );
}

export default function CallbackPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <CallbackContent />
    </Suspense>
  );
}
```

### index.html

```sh
python3 -m http.server 1420 # command to run server http://localhost:1420 or other
```

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Auth Callback</title>
    <script>
      window.onload = function () {
        const searchParams = window.location.search;
        const deepLinkUrl = `codexia://auth/callback${searchParams}`;
        window.location.href = deepLinkUrl;
      };
    </script>
  </head>
  <body>
    <div style="max-width: 600px; margin: 100px auto; padding: 16px">
      login success, you can close this page now.
    </div>
  </body>
</html>
```