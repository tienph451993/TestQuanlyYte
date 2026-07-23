import { create } from 'zustand';
import { supabase } from '../lib/supabase.js';

export const useAuth = create((set, get) => ({
  session: null,
  profile: null,
  loading: true,

  init: async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      await get()._loadProfile(data.session.user.id);
      set({ session: data.session });
    }
    set({ loading: false });

    supabase.auth.onAuthStateChange(async (_evt, session) => {
      if (session) {
        await get()._loadProfile(session.user.id);
        set({ session });
      } else {
        set({ session: null, profile: null });
      }
    });
  },

  _loadProfile: async (userId) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*, organization:organizations(*)')
      .eq('id', userId)
      .maybeSingle();
    if (error) console.error('profile load', error);
    set({ profile: data });
  },

  signIn: async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ session: null, profile: null });
  },

  isCompany: () => {
    const r = get().profile?.role;
    return r === 'company_admin' || r === 'company_user';
  },
  isAdmin: () => {
    const r = get().profile?.role;
    return r === 'company_admin' || r === 'unit_admin';
  },
  isCompanyAdmin: () => get().profile?.role === 'company_admin'
}));
