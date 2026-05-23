const TECH_TERMS = new Set<string>([
  'github', 'gitlab', 'bitbucket', 'gitea',

  'aws', 'gcp', 'azure', 'cloudflare', 'vercel', 'netlify', 'heroku',
  'supabase', 'firebase', 'firestore', 'dynamodb',

  'postgres', 'postgresql', 'mysql', 'mariadb', 'mongodb', 'redis',
  'sqlite', 'cassandra', 'neo4j', 'cockroachdb',

  'docker', 'kubernetes', 'k8s', 'podman', 'helm', 'nomad',

  'nextjs', 'nuxt', 'nuxtjs', 'sveltekit', 'astro', 'qwik', 'solidjs',
  'remix', 'tanstack', 'gatsby',
  'reactjs', 'vuejs', 'angularjs', 'emberjs', 'svelte',

  'kotlin', 'rust', 'golang', 'typescript', 'javascript',

  'jetpack', 'compose',
  'flutter', 'dart', 'swiftui', 'xamarin', 'ionic', 'cordova',

  'webpack', 'vite', 'rollup', 'parcel', 'esbuild', 'turbopack',
  'gradle', 'maven',

  'npm', 'pnpm', 'yarn', 'bun', 'bunx', 'pnpx', 'npx', 'nodejs',

  'figma', 'canva', 'miro',

  'jest', 'vitest', 'cypress', 'playwright', 'mocha', 'chai', 'selenium',

  'drizzle', 'prisma', 'sequelize', 'typeorm', 'mongoose',

  'graphql', 'restful', 'grpc', 'websocket', 'webrtc',

  'tailwindcss', 'tailwind', 'bootstrap', 'chakraui', 'shadcn',
  'radix', 'headlessui',

  'redux', 'mobx', 'zustand', 'recoil', 'jotai', 'pinia', 'vuex',

  'effect', 'fpts',

  'api', 'sdk', 'cli', 'gui', 'url', 'uri', 'http', 'https',
  'json', 'xml', 'yaml', 'toml', 'csv', 'sql', 'nosql', 'orm',
  'jwt', 'oauth', 'saml', 'ldap', 'ssl', 'tls',
  'dns', 'dhcp', 'tcp', 'udp', 'ip', 'mac', 'nat', 'vpn',
  'pwa', 'spa', 'ssr', 'ssg', 'csr', 'isr', 'mpa',
  'mvc', 'mvp', 'mvvm',
  'ide', 'vscode', 'intellij', 'webstorm', 'pycharm', 'phpstorm',

  'ios', 'macos', 'ipados', 'watchos', 'tvos',

  'devops', 'ci', 'cd', 'saas', 'paas', 'iaas', 'baas', 'faas',
])

export function isTechTerm(raw: string): boolean {
  return TECH_TERMS.has(raw.toLowerCase().trim())
}
