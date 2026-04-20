/**
 * pageRegistry.js — frontend mirror of HARTOS integrations/ui_actions/page_registry.py
 *
 * The backend (HARTOS) owns the canonical page list and exposes it to the
 * chat agent as the Navigate_App tool. This file exists only as a fallback
 * shown in the LiquidActionBar on initial mount, before the first chat
 * response hydrates real ui_actions from the backend. Keep `id` values and
 * `route` values in sync with page_registry.py — they're the shared contract.
 *
 * Adding a new page:
 *   1. Add the backend entry in integrations/ui_actions/page_registry.py
 *   2. Mirror the id + route + label here
 *   3. (Optional) add an MUI icon via @mui/icons-material
 */
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import ChatIcon from '@mui/icons-material/Chat';
import CloudIcon from '@mui/icons-material/Cloud';
import ExtensionIcon from '@mui/icons-material/Extension';
import ForumIcon from '@mui/icons-material/Forum';
import HubIcon from '@mui/icons-material/Hub';
import MemoryIcon from '@mui/icons-material/Memory';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import PeopleIcon from '@mui/icons-material/People';
import PrecisionManufacturingIcon from '@mui/icons-material/PrecisionManufacturing';
import SchoolIcon from '@mui/icons-material/School';
import SportsEsportsIcon from '@mui/icons-material/SportsEsports';
import StorefrontIcon from '@mui/icons-material/Storefront';

/** Map of MUI icon names (matches backend `icon` field) → component. */
export const ICON_MAP = {
  forum: ForumIcon,
  chat: ChatIcon,
  sports_esports: SportsEsportsIcon,
  school: SchoolIcon,
  storefront: StorefrontIcon,
  extension: ExtensionIcon,
  precision_manufacturing: PrecisionManufacturingIcon,
  memory: MemoryIcon,
  hub: HubIcon,
  cloud: CloudIcon,
  people: PeopleIcon,
  admin_panel_settings: AdminPanelSettingsIcon,
  open_in_new: OpenInNewIcon,
};

/** Fallback seed list — mirrors page_registry.py. Keep ids in sync. */
export const PAGE_REGISTRY = [
  { id: 'social_feed',     label: 'Social Hub',       route: '/social',             icon: 'forum',                    category: 'social',   requiresRole: null },
  { id: 'agent_chat',      label: 'Agent Chat',       route: '/local',              icon: 'chat',                     category: 'chat',     requiresRole: null },
  { id: 'games',           label: 'Games',            route: '/social/games',       icon: 'sports_esports',           category: 'play',     requiresRole: null },
  { id: 'kids',            label: 'Kids Learning',    route: '/social/kids',        icon: 'school',                   category: 'play',     requiresRole: null },
  { id: 'marketplace',     label: 'Marketplace',      route: '/social/marketplace', icon: 'storefront',               category: 'discover', requiresRole: null },
  { id: 'mcp_tools',       label: 'MCP Tools',        route: '/social/tools',       icon: 'extension',                category: 'discover', requiresRole: null },
  { id: 'autopilot',       label: 'Autopilot',        route: '/social/autopilot',   icon: 'precision_manufacturing',  category: 'agents',   requiresRole: null },
  { id: 'admin_models',    label: 'Model Management', route: '/admin/models',       icon: 'memory',                   category: 'admin',    requiresRole: 'central' },
  { id: 'admin_channels',  label: 'Channels',         route: '/admin/channels',     icon: 'hub',                      category: 'admin',    requiresRole: 'central' },
  { id: 'admin_providers', label: 'AI Providers',     route: '/admin/providers',    icon: 'cloud',                    category: 'admin',    requiresRole: 'central' },
  { id: 'admin_users',     label: 'Users',            route: '/admin/users',        icon: 'people',                   category: 'admin',    requiresRole: 'central' },
  { id: 'admin_home',      label: 'Admin',            route: '/admin',              icon: 'admin_panel_settings',     category: 'admin',    requiresRole: 'central' },
];

const ROLE_ORDER = { guest: 0, flat: 1, regional: 2, central: 3 };

/** Role-filter the seed list. Used before the first chat response hydrates. */
export function listPages(userRole = 'flat') {
  const userRank = ROLE_ORDER[userRole] ?? 1;
  return PAGE_REGISTRY.filter((p) => {
    if (!p.requiresRole) return true;
    const needed = ROLE_ORDER[p.requiresRole] ?? 3;
    return userRank >= needed;
  });
}

/** Resolve a ui_action → MUI icon component (falls back to OpenInNew). */
export function iconFor(iconName) {
  return ICON_MAP[iconName] || OpenInNewIcon;
}
