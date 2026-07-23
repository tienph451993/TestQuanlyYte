# MedStock — Quản lý Thuốc & Vật tư Y tế

Hệ thống nội bộ cho 1 Công ty + 25 Điện lực. Xem `MedStock_Spec_v2.md` (nếu có) để biết đầy đủ đặc tả.

## Stack
- React 18 + Vite 5 + React Router 6
- Zustand (client state) + React Query (server state)
- Supabase (Postgres + Auth + Realtime + RLS)
- PWA (`vite-plugin-pwa`)
- Flat UI custom design system (không dùng component lib)

## Chạy local
```bash
npm install
cp .env.example .env   # điền URL + anon key
npm run dev
```

## Phase 1 delivered
- Supabase schema đầy đủ (organizations, profiles, medicines, stock_locations, stock_batches, transactions, stock_checks, usage_logs, transfer_requests, procurement_*)
- RLS policies theo role (`company_admin`, `company_user`, `unit_admin`, `unit_user`)
- Seed: 1 công ty + 25 điện lực + 30 loại thuốc/vật tư
- Auth: login + phân quyền + protected routes
- CRUD danh mục thuốc (company_admin)
- CRUD vị trí kho/tủ/hộp sơ cứu
- Nhập kho từ công ty
- Bổ sung tủ/hộp với gợi ý FEFO + nhắc sắp xếp vật lý
- Dashboard cơ bản (tồn kho theo vị trí + snapshot HSD)
- PWA manifest + service worker
