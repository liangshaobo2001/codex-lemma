import { BookOpen, Compass, Globe, Plug, Search } from 'lucide-react';

const brandIcons = import.meta.glob<string>('../../../registry/icons/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
});

const brandIconByName = new Map(
  Object.entries(brandIcons).map(([path, url]) => [path.replace(/^.*\/(.+)\.svg$/, '$1'), url])
);

// Connectors without a brand SVG in registry/icons.
const fallbackIcons = {
  deepwiki: BookOpen,
  'you-search': Search,
  'keenable-search': Compass,
};

export function ConnectorIcon({ name }: { name: string }) {
  const brandIcon = brandIconByName.get(name);
  if (brandIcon) {
    return (
      <img
        src={brandIcon}
        alt=""
        className={`size-5 shrink-0 ${name === 'github' ? 'dark:invert' : ''}`}
      />
    );
  }
  const Icon =
    fallbackIcons[name as keyof typeof fallbackIcons] ?? (name.includes('http') ? Globe : Plug);
  return <Icon className="size-5 shrink-0" aria-hidden />;
}
