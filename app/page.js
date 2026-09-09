'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

const initials = (name) => name.split(/\s+/).map((x) => x[0]).join('').slice(0, 2).toUpperCase();
const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

function formatBirthday(dateString) {
  const date = new Date(`${dateString}T00:00:00`);
  return `${date.getDate()} ${monthNames[date.getMonth()]}`;
}

function getBirthdayDate(dateString) {
  const date = new Date(`${dateString}T00:00:00`);
  const today = new Date();
  let next = new Date(today.getFullYear(), date.getMonth(), date.getDate());
  const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (next.getMonth() === today.getMonth() && next.getDate() === today.getDate()) return { next, isToday: true };
  if (next < todayOnly) next = new Date(today.getFullYear() + 1, date.getMonth(), date.getDate());
  return { next, isToday: false };
}

export default function Home() {
  const [group, setGroup] = useState(null);
  const [members, setMembers] = useState([]);
  const [birthdays, setBirthdays] = useState([]);
  const [obligations, setObligations] = useState([]);
  const [payments, setPayments] = useState([]);
  const [paymentAllocations, setPaymentAllocations] = useState([]);
  const [advanceAllocations, setAdvanceAllocations] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [selected, setSelected] = useState(0);
  const [activeTab, setActiveTab] = useState('all');
  const [showPayment, setShowPayment] = useState(false);
  const [selectedMemberDetail, setSelectedMemberDetail] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const [person, setPerson] = useState('');
  const [amount, setAmount] = useState(100);
  const [file, setFile] = useState(null);
  const [allocationRows, setAllocationRows] = useState([]);
  const [keepAsAdvance, setKeepAsAdvance] = useState(false);
  const [toast, setToast] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [adminFilter, setAdminFilter] = useState('AWAITING_VERIFICATION');
  const [adminBusyId, setAdminBusyId] = useState('');
  const [viewerUrls, setViewerUrls] = useState({});
  const [session, setSession] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [profile, setProfile] = useState(null);
  const [showMembers, setShowMembers] = useState(false);
  const [allProfiles, setAllProfiles] = useState([]);
  const [memberBusyId, setMemberBusyId] = useState('');
  const [authChecked, setAuthChecked] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [authMode, setAuthMode] = useState('login');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [showExpense, setShowExpense] = useState(false);
  const [expenseCategory, setExpenseCategory] = useState('Cake');
  const [expenseAmount, setExpenseAmount] = useState(0);
  const [expenseDescription, setExpenseDescription] = useState('');
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().slice(0, 10));
  const [expenseBusy, setExpenseBusy] = useState(false);

  async function refreshAdminState(currentSession) {
    setSession(currentSession || null);
    if (!currentSession) {
      setIsAdmin(false);
      setProfile(null);
      return;
    }
    const { data, error } = await supabase
      .from('profiles')
      .select('role,member_id,email')
      .eq('id', currentSession.user.id)
      .maybeSingle();
    if (error) {
      console.error(error);
      setIsAdmin(false);
      return;
    }
    setProfile(data || null);
    if (data?.member_id) setPerson(data.member_id);
    setIsAdmin(data?.role === 'admin');
  }

  useEffect(() => {
    if (!supabase) {
      setAuthChecked(true);
      return;
    }
    let mounted = true;
    supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
      if (!mounted) return;
      refreshAdminState(currentSession).finally(() => setAuthChecked(true));
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      refreshAdminState(currentSession);
    });
    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  async function handleAuthSubmit(e) {
    e.preventDefault();
    if (!authEmail || !authPassword) return setToast('Enter your email and password.');
    setAuthBusy(true);
    try {
      if (authMode === 'signup') {
        const { data, error } = await supabase.auth.signUp({ email: authEmail.trim(), password: authPassword });
        if (error) throw error;
        if (!data.session) {
          setToast('Account created. Check your email to confirm your account, then log in.');
          setAuthMode('login');
        } else {
          setToast('Account created. An admin can now assign your role.');
          setShowLogin(false);
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email: authEmail.trim(), password: authPassword });
        if (error) throw error;
        await refreshAdminState(data.session);
        setShowLogin(false);
        setToast('Signed in.');
      }
      setAuthPassword('');
    } catch (error) {
      console.error(error);
      setToast(error.message || 'Authentication failed.');
    } finally {
      setAuthBusy(false);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    setShowAdmin(false);
    setIsAdmin(false);
    setProfile(null);
    setSession(null);
    setShowMembers(false);
    setToast('Signed out.');
  }

  async function openMembers() {
    if (!session) {
      setAuthMode('login');
      setShowLogin(true);
      return;
    }
    if (!isAdmin) {
      setToast('Only admins can manage member assignments.');
      return;
    }
    const { data, error } = await supabase.from('profiles').select('id,email,role,member_id,created_at').order('created_at', { ascending: true });
    if (error) return setToast(error.message || 'Could not load member accounts.');
    setAllProfiles(data || []);
    setShowMembers(true);
  }

  async function assignMember(profileId, memberId) {
    if (!isAdmin) return;
    setMemberBusyId(profileId);
    try {
      const { data, error } = await supabase.from('profiles').update({ member_id: memberId || null }).eq('id', profileId).select('id,email,role,member_id,created_at').single();
      if (error) throw error;
      setAllProfiles(prev => prev.map(p => p.id === profileId ? { ...p, ...data } : p));
      if (profileId === session?.user?.id) {
        setProfile(data);
        setPerson(data.member_id || '');
      }
      setToast('Member assignment updated.');
    } catch (error) {
      console.error(error);
      setToast(error.message || 'Could not update member assignment.');
    } finally {
      setMemberBusyId('');
    }
  }

  function openAdmin() {
    if (!session) {
      setAuthMode('login');
      setShowLogin(true);
      return;
    }
    if (!isAdmin) {
      setToast('Your account does not have admin access.');
      return;
    }
    setShowAdmin(true);
  }

  async function loadData() {
    if (!supabase) {
      setLoadError('Supabase environment variables are missing.');
      setLoading(false);
      return;
    }
    try {
      const { data: groupData, error: groupError } = await supabase.from('groups').select('*').eq('name', 'Birthday Fund').limit(1).single();
      if (groupError) throw groupError;

      const { data: memberData, error: memberError } = await supabase.from('members').select('*').eq('group_id', groupData.id).eq('is_active', true).order('created_at', { ascending: true });
      if (memberError) throw memberError;
      const memberIds = memberData.map((m) => m.id);

      const { data: birthdayData, error: birthdayError } = await supabase.from('birthdays').select('*').in('member_id', memberIds);
      if (birthdayError) throw birthdayError;

      const birthdayIds = birthdayData.map((b) => b.id);
      const { data: obligationData, error: obligationError } = await supabase.from('contribution_obligations').select('id,birthday_id,member_id,required_amount').in('member_id', memberIds);
      if (obligationError) throw obligationError;

      const { data: paymentData, error: paymentError } = await supabase.from('payments').select('id,member_id,amount,payment_status,submitted_at,birthday_id,unallocated_amount').in('member_id', memberIds).order('submitted_at', { ascending: false });
      if (paymentError) throw paymentError;

      const paymentIds = (paymentData || []).map((p) => p.id);
      let allocationData = [];
      if (paymentIds.length) {
        const { data, error } = await supabase.from('payment_allocations').select('id,payment_id,obligation_id,amount').in('payment_id', paymentIds);
        if (error) throw error;
        allocationData = data || [];
      }

      let advanceData = [];
      if (obligationData?.length) {
        const { data, error } = await supabase.from('advance_allocations').select('id,obligation_id,amount').in('obligation_id', obligationData.map((o) => o.id));
        if (error) throw error;
        advanceData = data || [];
      }

      const birthdayMap = new Map(birthdayData.map((b) => [b.member_id, b]));
      const normalized = memberData.filter((m) => birthdayMap.has(m.id)).map((m) => {
        const b = birthdayMap.get(m.id);
        return { id: b.id, memberId: m.id, name: m.name, date: formatBirthday(b.birthday_date), rawDate: b.birthday_date };
      }).sort((a, b) => getBirthdayDate(a.rawDate).next - getBirthdayDate(b.rawDate).next);

      setGroup(groupData);
      setMembers(memberData);
      setBirthdays(normalized);
      setObligations(obligationData || []);
      setPayments(paymentData || []);
      setPaymentAllocations(allocationData);
      setAdvanceAllocations(advanceData);

      const { data: expenseData, error: expenseError } = await supabase
        .from('expenses')
        .select('id,group_id,category,amount,expense_date,description,created_by,created_at')
        .eq('group_id', groupData.id)
        .order('expense_date', { ascending: false })
        .order('created_at', { ascending: false });
      if (expenseError) throw expenseError;
      setExpenses(expenseData || []);

      const todayIndex = normalized.findIndex((b) => getBirthdayDate(b.rawDate).isToday);
      setSelected(todayIndex >= 0 ? todayIndex : 0);
      setPerson(memberData[0]?.id || '');
      setAmount(Number(groupData.contribution_amount || 100));
    } catch (error) {
      console.error(error);
      setLoadError(error.message || 'Could not load data from Supabase.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, []);

  const adminPayments = payments.filter((p) => p.payment_status === adminFilter);

  async function openScreenshot(payment) {
    if (!isAdmin) return setToast('Admin access required to view payment screenshots.');
    if (!payment?.screenshot_path) return setToast('No screenshot is attached to this payment.');
    if (viewerUrls[payment.id]) { window.open(viewerUrls[payment.id], '_blank', 'noopener,noreferrer'); return; }
    try {
      const { data, error } = await supabase.storage.from('payment-receipts').createSignedUrl(payment.screenshot_path, 300);
      if (error) throw error;
      setViewerUrls((prev) => ({ ...prev, [payment.id]: data.signedUrl }));
      window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
    } catch (error) {
      console.error(error);
      setToast(error.message || 'Could not open screenshot.');
    }
  }

  async function addExpense(e) {
    e.preventDefault();
    if (!isAdmin) return setToast('Admin access required.');
    const numericExpense = Number(expenseAmount || 0);
    if (numericExpense <= 0) return setToast('Enter a valid expense amount.');
    if (numericExpense % 50 !== 0) return setToast('Expense amount must be in multiples of ₹50.');
    setExpenseBusy(true);
    try {
      const { data, error } = await supabase.from('expenses').insert({
        group_id: group.id,
        category: expenseCategory,
        amount: numericExpense,
        expense_date: expenseDate,
        description: expenseDescription.trim() || null,
        created_by: session?.user?.id || null,
      }).select('id,group_id,category,amount,expense_date,description,created_by,created_at').single();
      if (error) throw error;
      setExpenses((prev) => [data, ...prev]);
      setShowExpense(false);
      setExpenseAmount(0);
      setExpenseDescription('');
      setExpenseCategory('Cake');
      setExpenseDate(new Date().toISOString().slice(0, 10));
      setToast(`${money(numericExpense)} expense added.`);
      setTimeout(() => setToast(''), 3000);
    } catch (error) {
      console.error(error);
      setToast(error.message || 'Could not add expense.');
    } finally {
      setExpenseBusy(false);
    }
  }

  async function deleteExpense(expenseId) {
    if (!isAdmin) return setToast('Admin access required.');
    if (!window.confirm('Delete this expense?')) return;
    setExpenseBusy(true);
    try {
      const { error } = await supabase.from('expenses').delete().eq('id', expenseId);
      if (error) throw error;
      setExpenses((prev) => prev.filter((x) => x.id !== expenseId));
      setToast('Expense deleted.');
      setTimeout(() => setToast(''), 2500);
    } catch (error) {
      console.error(error);
      setToast(error.message || 'Could not delete expense.');
    } finally {
      setExpenseBusy(false);
    }
  }

  async function updatePaymentStatus(paymentId, nextStatus) {
    if (!isAdmin) return setToast('Admin access required.');
    setAdminBusyId(paymentId);
    try {
      const { data, error } = await supabase
        .from('payments')
        .update({ payment_status: nextStatus })
        .eq('id', paymentId)
        .select('id,member_id,amount,payment_status,submitted_at,birthday_id,unallocated_amount')
        .single();
      if (error) throw error;
      setPayments((prev) => prev.map((p) => p.id === paymentId ? { ...p, ...data } : p));
      setToast(nextStatus === 'APPROVED' ? 'Payment approved.' : 'Payment rejected.');
      setTimeout(() => setToast(''), 3000);
    } catch (error) {
      console.error(error);
      setToast(error.message || 'Could not update payment status.');
    } finally {
      setAdminBusyId('');
    }
  }


  const birthday = birthdays[selected];
  const standardContribution = Number(group?.contribution_amount || 100);

  const balanceByObligation = useMemo(() => {
    const map = new Map();
    for (const o of obligations) map.set(o.id, { required: Number(o.required_amount), paid: 0, advance: 0 });
    for (const a of paymentAllocations) {
      const payment = payments.find((p) => p.id === a.payment_id);
      if (payment?.payment_status === 'APPROVED' && map.has(a.obligation_id)) map.get(a.obligation_id).paid += Number(a.amount);
    }
    for (const a of advanceAllocations) if (map.has(a.obligation_id)) map.get(a.obligation_id).advance += Number(a.amount);
    for (const [id, b] of map) b.remaining = Math.max(0, b.required - b.paid - b.advance);
    return map;
  }, [obligations, paymentAllocations, payments, advanceAllocations]);

  const awaitingByObligation = useMemo(() => {
    const map = new Map();
    for (const a of paymentAllocations) {
      const p = payments.find((x) => x.id === a.payment_id);
      if (p?.payment_status === 'AWAITING_VERIFICATION') map.set(a.obligation_id, (map.get(a.obligation_id) || 0) + Number(a.amount));
    }
    return map;
  }, [paymentAllocations, payments]);

  const statusOf = (member) => {
    if (!birthday) return null;
    const obligation = obligations.find((o) => o.birthday_id === birthday.id && o.member_id === member.id);
    if (!obligation) return null;
    const balance = balanceByObligation.get(obligation.id);
    const awaiting = awaitingByObligation.get(obligation.id) || 0;
    if (balance && balance.remaining <= 0) return { amount: balance.paid + balance.advance, status: 'Paid' };
    if (awaiting > 0) return { amount: awaiting, status: 'Awaiting Verification' };
    return null;
  };

  const paidMembers = members.filter((m) => statusOf(m)?.status === 'Paid');
  const awaitingMembers = members.filter((m) => statusOf(m)?.status === 'Awaiting Verification');
  const pendingMembers = members.filter((m) => !statusOf(m));

  const birthdayObligations = obligations.filter((o) => o.birthday_id === birthday?.id);
  const target = birthdayObligations.reduce((sum, o) => sum + Number(o.required_amount), 0);
  const collected = birthdayObligations.reduce((sum, o) => sum + Number(balanceByObligation.get(o.id)?.paid || 0) + Number(balanceByObligation.get(o.id)?.advance || 0), 0);
  const pendingAmount = birthdayObligations.reduce((sum, o) => sum + Number(balanceByObligation.get(o.id)?.remaining || 0), 0);
  const progress = target > 0 ? Math.min(100, Math.round((collected / target) * 100)) : 0;

  const payer = members.find((m) => m.id === person);
  const payerObligations = obligations.filter((o) => o.member_id === person);
  const payerBirthdayOptions = birthdays.map((b) => {
    const o = payerObligations.find((x) => x.birthday_id === b.id);
    if (!o) return null;
    return { ...b, obligationId: o.id, remaining: balanceByObligation.get(o.id)?.remaining || 0 };
  }).filter(Boolean).filter((x) => x.remaining > 0);

  const allocatedTotal = allocationRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const numericAmount = Number(amount || 0);
  const unallocated = Math.max(0, numericAmount - allocatedTotal);
  const allocationValid = allocationRows.every((row) => {
    const option = payerBirthdayOptions.find((x) => x.obligationId === row.obligationId);
    return Number(row.amount) > 0 && option && Number(row.amount) <= option.remaining;
  });

  function openPayment(memberId = '') {
    const nextPerson = memberId || (!isAdmin && profile?.member_id) || members[0]?.id || '';
    setPerson(nextPerson);
    setAmount(standardContribution);
    setFile(null);
    setKeepAsAdvance(false);
    setToast('');
    setAllocationRows([]);
    setShowPayment(true);
    setTimeout(() => {
      const currentBirthday = birthdays[selected];
      const o = obligations.find((x) => x.birthday_id === currentBirthday?.id && x.member_id === nextPerson);
      const remaining = o ? balanceByObligation.get(o.id)?.remaining || 0 : 0;
      if (o && remaining > 0) setAllocationRows([{ obligationId: o.id, amount: Math.min(standardContribution, remaining) }]);
    }, 0);
  }

  function changePerson(memberId) {
    setPerson(memberId);
    const o = obligations.find((x) => x.birthday_id === birthday?.id && x.member_id === memberId);
    const remaining = o ? balanceByObligation.get(o.id)?.remaining || 0 : 0;
    setAllocationRows(o && remaining > 0 ? [{ obligationId: o.id, amount: Math.min(standardContribution, remaining) }] : []);
    setKeepAsAdvance(false);
  }

  function addAllocation() {
    const used = new Set(allocationRows.map((r) => r.obligationId));
    const option = payerBirthdayOptions.find((x) => !used.has(x.obligationId));
    if (!option) return setToast('No other birthday obligation is available for this member.');
    const remainingPayment = Math.max(0, numericAmount - allocatedTotal);
    if (remainingPayment <= 0) return setToast('The full payment is already allocated.');
    setAllocationRows((rows) => [...rows, { obligationId: option.obligationId, amount: Math.min(remainingPayment, option.remaining) }]);
  }

  function updateAmount(value) {
    const nextAmount = Math.max(0, Number(value || 0));
    setAmount(value);

    // Never let existing allocation rows exceed the new payment total.
    // Keep each birthday within its own outstanding balance as well.
    setAllocationRows((rows) => {
      let remainingPayment = nextAmount;
      return rows.map((row) => {
        const option = payerBirthdayOptions.find((x) => x.obligationId === row.obligationId);
        const maxForBirthday = Number(option?.remaining || 0);
        const nextRowAmount = Math.min(Number(row.amount || 0), maxForBirthday, remainingPayment);
        remainingPayment = Math.max(0, remainingPayment - nextRowAmount);
        return { ...row, amount: nextRowAmount };
      });
    });
  }

  function updateAllocation(index, value) {
    const requested = Math.max(0, Number(value || 0));
    setAllocationRows((rows) => {
      const otherAllocated = rows.reduce((sum, row, i) => i === index ? sum : sum + Number(row.amount || 0), 0);
      const row = rows[index];
      const option = payerBirthdayOptions.find((x) => x.obligationId === row?.obligationId);
      const maxForPayment = Math.max(0, numericAmount - otherAllocated);
      const maxForBirthday = Number(option?.remaining || 0);
      const safeAmount = Math.min(requested, maxForPayment, maxForBirthday);
      return rows.map((r, i) => i === index ? { ...r, amount: safeAmount } : r);
    });
  }

  function removeAllocation(index) {
    setAllocationRows((rows) => rows.filter((_, i) => i !== index));
  }

  async function submitPayment(e) {
    e.preventDefault();
    const effectivePerson = (!isAdmin && profile?.member_id) ? profile.member_id : person;
    const effectivePayer = members.find((m) => m.id === effectivePerson);
    if (!isAdmin && !effectivePayer) return setToast('Your account has not been assigned to a member yet. Ask an admin to assign you.');
    if (!file) return setToast('Please choose a payment screenshot.');
    if (!effectivePayer || numericAmount <= 0 || numericAmount % 50 !== 0) return setToast('Choose a valid payment amount in multiples of ₹50.');
    if (!allocationRows.length) return setToast('Allocate the payment to at least one birthday.');
    if (!allocationValid) return setToast('Check the allocation amounts. They cannot exceed the outstanding amount.');
    if (allocatedTotal > numericAmount) return setToast('Allocated amount cannot exceed the payment amount.');
    if (unallocated > 0 && !keepAsAdvance) return setToast(`₹${unallocated} is still unallocated. Add another birthday or mark it as an advance.`);

    setSubmitting(true);
    try {
      // 1. Create the payment in an unverified state.
      const { data: payment, error: paymentError } = await supabase.from('payments').insert({
        member_id: effectivePayer.id,
        birthday_id: birthday.id,
        amount: numericAmount,
        unallocated_amount: unallocated,
        payment_status: 'AWAITING_VERIFICATION',
        payment_method: 'UPI',
        note: 'Payment screenshot uploaded.',
      }).select('id,member_id,amount,payment_status,submitted_at,birthday_id,unallocated_amount').single();
      if (paymentError) throw paymentError;

      // 2. Upload the screenshot to the PRIVATE Supabase Storage bucket.
      const extension = file.name.includes('.')
        ? file.name.split('.').pop().toLowerCase()
        : 'jpg';
      const safeExtension = /^[a-z0-9]+$/.test(extension) ? extension : 'jpg';
      const screenshotPath = `${effectivePayer.id}/${payment.id}-screenshot.${safeExtension}`;

      const { error: uploadError } = await supabase.storage
        .from('payment-receipts')
        .upload(screenshotPath, file, {
          cacheControl: '3600',
          upsert: false,
          contentType: file.type || 'image/jpeg',
        });
      if (uploadError) throw uploadError;

      // 3. Save the private Storage path on the payment.
      const { error: screenshotUpdateError } = await supabase
        .from('payments')
        .update({
          screenshot_path: screenshotPath,
          note: `Screenshot uploaded: ${file.name}`,
        })
        .eq('id', payment.id);
      if (screenshotUpdateError) throw screenshotUpdateError;

      // 4. Save the birthday allocations.
      const rows = allocationRows.map((row) => ({
        payment_id: payment.id,
        obligation_id: row.obligationId,
        amount: Number(row.amount),
      }));
      const { error: allocationError } = await supabase.from('payment_allocations').insert(rows);
      if (allocationError) throw allocationError;

      setPayments((prev) => [payment, ...prev]);
      setPaymentAllocations((prev) => [
        ...prev,
        ...rows.map((r) => ({ ...r, id: crypto.randomUUID() })),
      ]);
      setShowPayment(false);
      setFile(null);
      setAllocationRows([]);
      setKeepAsAdvance(false);
      setToast(`Payment of ${money(numericAmount)} submitted for verification.`);
      setTimeout(() => setToast(''), 3500);
    } catch (error) {
      console.error(error);
      setToast(error.message || 'Could not submit payment.');
    } finally {
      setSubmitting(false);
    }
  }

  const visiblePending = showAll ? pendingMembers : pendingMembers.slice(0, 6);
  const currentMonth = new Date().toLocaleString('en-IN', { month: 'long', year: 'numeric' }).toUpperCase();
  const confirmedContributions = payments.filter((p) => p.payment_status === 'APPROVED').reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const totalExpenses = expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
  const remainingFund = confirmedContributions - totalExpenses;
  const awaitingCount = payments.filter((p) => p.payment_status === 'AWAITING_VERIFICATION').length;
  const rejectedCount = payments.filter((p) => p.payment_status === 'REJECTED').length;
  const totalRequired = obligations.reduce((sum, o) => sum + Number(o.required_amount || 0), 0);
  const overallProgress = totalRequired > 0 ? Math.min(100, Math.round((confirmedContributions / totalRequired) * 100)) : 0;
  const selectedBirthdayDue = pendingAmount;
  const selectedBirthdayStatusLabel = progress >= 100 ? 'Fully funded' : `${money(selectedBirthdayDue)} still to collect`;
  const signedInMember = members.find((m) => m.id === profile?.member_id);
  const signedInMemberObligation = birthday && signedInMember
    ? obligations.find((o) => o.birthday_id === birthday.id && o.member_id === signedInMember.id)
    : null;
  const signedInMemberRemaining = signedInMemberObligation
    ? Number(balanceByObligation.get(signedInMemberObligation.id)?.remaining || 0)
    : 0;
  const upcomingBirthdays = birthdays
    .map((b) => ({ ...b, next: getBirthdayDate(b.rawDate).next, isToday: getBirthdayDate(b.rawDate).isToday }))
    .sort((a, b) => a.next - b.next);
  const nextBirthday = upcomingBirthdays[0];
  const nextBirthdayLabel = nextBirthday ? (nextBirthday.isToday ? 'Today' : nextBirthday.next.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })) : '—';
  const recentActivity = [
    ...payments.map((p) => ({
      type: 'payment',
      id: `payment-${p.id}`,
      date: p.submitted_at ? new Date(p.submitted_at) : new Date(0),
      member: members.find((m) => m.id === p.member_id)?.name || 'Member',
      amount: Number(p.amount || 0),
      status: p.payment_status,
    })),
    ...expenses.map((e) => ({
      type: 'expense',
      id: `expense-${e.id}`,
      date: e.created_at ? new Date(e.created_at) : new Date(`${e.expense_date}T00:00:00`),
      member: e.category,
      amount: Number(e.amount || 0),
      status: 'EXPENSE',
    })),
  ].sort((a, b) => b.date - a.date).slice(0, 6);
  const nextThreeBirthdays = upcomingBirthdays.filter((b) => b.id !== birthday.id).slice(0, 3);

  if (loading) return <main className="site"><div className="page"><div className="page-heading"><div><span className="kicker">BIRTHDAY FUND</span><h1>Loading your fund…</h1><p>Connecting to the shared birthday data.</p></div></div></div></main>;
  if (loadError) return <main className="site"><div className="page"><div className="page-heading"><div><span className="kicker">CONNECTION ERROR</span><h1>Couldn’t load the fund</h1><p>{loadError}</p></div></div></div></main>;
  if (!birthday) return <main className="site"><div className="page"><div className="page-heading"><div><span className="kicker">BIRTHDAY FUND</span><h1>No birthdays found</h1><p>Add birthdays in Supabase and refresh the page.</p></div></div></div></main>;

  return (
    <main className="site">
      <header className="nav"><div className="brand"><div className="brand-mark">B</div><div><strong>Birthday Fund</strong><span>Shared celebrations, made simple.</span></div></div><div className="nav-actions"><button className="nav-link">Dashboard</button>{session&&isAdmin&&<button className="nav-link" onClick={openMembers}>Members</button>}{session&&isAdmin&&<button className="nav-link" onClick={openAdmin}>Admin</button>}{!session&&<button className="nav-link" onClick={()=>{setAuthMode('login');setShowLogin(true)}}>Sign in</button>}{session&&<button className="nav-link" onClick={signOut}>Sign out</button>}{session&&<button className="avatar-button" onClick={()=>isAdmin?openMembers():setShowLogin(false)}>{initials(members.find(m => m.id === profile?.member_id)?.name || session?.user?.email || 'U')}</button>}</div></header>
      {showLogin&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!authBusy)setShowLogin(false)}}><div className="modal auth-modal"><div className="modal-header"><div><span className="eyebrow">SECURE ACCESS</span><h3>{authMode==='login'?'Sign in':'Create account'}</h3><p>{authMode==='login'?'Sign in with your Birthday Fund account.':'Create an account; an existing admin can assign your member account.'}</p></div><button type="button" onClick={()=>!authBusy&&setShowLogin(false)}>×</button></div><form onSubmit={handleAuthSubmit}><label>Email<input type="email" value={authEmail} onChange={e=>setAuthEmail(e.target.value)} autoComplete="email" placeholder="you@example.com" /></label><label>Password<input type="password" value={authPassword} onChange={e=>setAuthPassword(e.target.value)} autoComplete={authMode==='login'?'current-password':'new-password'} placeholder="••••••••" /></label><button className="primary full" type="submit" disabled={authBusy}>{authBusy?(authMode==='login'?'Signing in…':'Creating…'):(authMode==='login'?'Sign in':'Create account')}</button><button type="button" className="show-more" onClick={()=>setAuthMode(authMode==='login'?'signup':'login')}>{authMode==='login'?'Need an account? Create one':'Already have an account? Sign in'}</button></form></div></div>}
      {showMembers&&isAdmin&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!memberBusyId)setShowMembers(false)}}><div className="modal admin-modal members-modal"><div className="modal-header"><div><span className="eyebrow">ADMIN · MEMBERS</span><h3>Member accounts</h3><p>Assign each login account to a birthday-fund member.</p></div><button type="button" onClick={()=>!memberBusyId&&setShowMembers(false)}>×</button></div><div className="member-account-list">{allProfiles.length===0?<div className="admin-empty"><b>No accounts yet.</b><span>Members can create accounts from the sign-in screen.</span></div>:allProfiles.map(account=>{const assigned=members.find(m=>m.id===account.member_id);return <div className="member-account" key={account.id}><div><b>{account.email||'No email'}</b><small>{account.role==='admin'?'Admin account':'Member account'} · {assigned?`Assigned to ${assigned.name}`:'Not assigned'}</small></div><select value={account.member_id||''} onChange={e=>assignMember(account.id,e.target.value)} disabled={memberBusyId===account.id}><option value="">Not assigned</option>{members.map(member=><option key={member.id} value={member.id}>{member.name}</option>)}</select></div>})}</div><div className="admin-note">Assign each account to the matching person. Non-admin users can then submit payments only for their own account.</div></div></div>}

      {showAdmin&&isAdmin&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!adminBusyId)setShowAdmin(false)}}><div className="modal admin-modal"><div className="modal-header"><div><span className="eyebrow">ADMIN</span><h3>Payment verification</h3><p>Review submitted screenshots before money is counted as confirmed.</p></div><button type="button" onClick={()=>!adminBusyId&&setShowAdmin(false)}>×</button></div>
        <div className="admin-tabs">{['AWAITING_VERIFICATION','APPROVED','REJECTED'].map(status=><button type="button" key={status} className={adminFilter===status?'active':''} onClick={()=>setAdminFilter(status)}>{status==='AWAITING_VERIFICATION'?'Awaiting':status==='APPROVED'?'Approved':'Rejected'} <span>{payments.filter(p=>p.payment_status===status).length}</span></button>)}</div>
        <div className="admin-list">{adminPayments.length===0?<div className="admin-empty"><b>No {adminFilter==='AWAITING_VERIFICATION'?'payments awaiting verification':adminFilter.toLowerCase()+' payments'}.</b><span>New submissions will appear here.</span></div>:adminPayments.map(payment=>{const member=members.find(m=>m.id===payment.member_id);const b=birthdays.find(x=>x.memberId===payment.member_id);return <div className="admin-payment" key={payment.id}><div className="admin-payment-main"><div className="mini-avatar">{initials(member?.name||'Member')}</div><div><b>{member?.name||'Unknown member'}</b><small>{money(payment.amount)} · Submitted {payment.submitted_at?new Date(payment.submitted_at).toLocaleString('en-IN'):''}</small><small>Primary birthday: {b?.name||'—'}</small></div><strong>{money(payment.amount)}</strong></div><div className="admin-actions"><button type="button" className="secondary" onClick={()=>openScreenshot(payment)} disabled={!payment.screenshot_path}>View screenshot</button>{payment.payment_status==='AWAITING_VERIFICATION'&&<><button type="button" className="danger-button" disabled={adminBusyId===payment.id} onClick={()=>updatePaymentStatus(payment.id,'REJECTED')}>{adminBusyId===payment.id?'Updating…':'Reject'}</button><button type="button" className="approve-button" disabled={adminBusyId===payment.id} onClick={()=>updatePaymentStatus(payment.id,'APPROVED')}>{adminBusyId===payment.id?'Updating…':'Approve'}</button></>}</div></div>})}</div>
        <div className="expense-section">
          <div className="expense-header"><div><span className="eyebrow">EXPENSES</span><h4>Fund spending</h4><p>Record cake, shirt/gift, or other confirmed expenses.</p></div><button type="button" className="secondary" onClick={()=>setShowExpense(true)}>+ Add expense</button></div>
          <div className="expense-summary"><div><small>Contributions</small><b>{money(confirmedContributions)}</b></div><div><small>Expenses</small><b>{money(totalExpenses)}</b></div><div><small>Remaining</small><b className={remainingFund<0?'negative':''}>{money(remainingFund)}</b></div></div>
          <div className="expense-list">{expenses.length===0?<div className="admin-empty"><b>No expenses yet.</b><span>Add the cake, shirt/gift, or other spending here.</span></div>:expenses.map(exp=><div className="expense-row" key={exp.id}><div><b>{exp.category}</b><small>{exp.expense_date}{exp.description?` · ${exp.description}`:''}</small></div><strong>{money(exp.amount)}</strong><button type="button" className="danger-button" disabled={expenseBusy} onClick={()=>deleteExpense(exp.id)}>Delete</button></div>)}</div>
        </div>
        <div className="admin-note">Approval makes the payment count toward contribution balances. Rejected payments remain excluded.</div>
      </div></div>}

      <div className="page">
        <div className="page-heading"><div><span className="kicker">{currentMonth}</span><h1>Birthday contributions</h1><p>Keep track of the fund, see who is pending, and verify payments.</p></div><button className="primary" onClick={() => { if (!session) { setAuthMode('login'); setShowLogin(true); return; } openPayment(); }}>Add contribution <span>＋</span></button></div>

        <section className="birthday-banner"><div className="banner-main"><div className="date-orb"><span>{birthday.date.split(' ')[0]}</span><small>{birthday.date.split(' ')[1].toUpperCase()}</small></div><div><span className="eyebrow">{getBirthdayDate(birthday.rawDate).isToday ? "TODAY'S BIRTHDAY" : 'SELECTED BIRTHDAY'}</span><h2>{birthday.name}</h2><p>{birthday.date} · Let's make it a good one.</p></div></div><div className="birthday-picker"><label>Birthday</label><select value={selected} onChange={(e) => setSelected(Number(e.target.value))}>{birthdays.map((b,i)=><option value={i} key={b.id}>{b.name} — {b.date}</option>)}</select></div></section>

        <section className="dashboard-overview">
          <div className="overview-hero">
            <div className="overview-copy">
              <span className="eyebrow">SHARED FUND · OVERVIEW</span>
              <h2>{money(remainingFund)} <small>available</small></h2>
              <p>Confirmed contributions minus recorded spending. Keep an eye on the balance before the next celebration.</p>
              <div className="overview-progress">
                <div className="overview-progress-head"><span>{money(confirmedContributions)} collected</span><b>{overallProgress}%</b></div>
                <div className="progress-track"><span style={{width:`${overallProgress}%`}} /></div>
                <small>{money(totalRequired)} total planned contributions</small>
              </div>
            </div>
            <div className="overview-side"><div className="overview-orb"><span>{overallProgress}%</span><small>FUNDED</small></div>{session&&isAdmin&&awaitingCount>0&&<button type="button" className="overview-action" onClick={openAdmin}>Review {awaitingCount} pending</button>}</div>
          </div>

          <div className="overview-stats">
            <div className="dashboard-stat"><span className="stat-icon">₹</span><div><small>CONFIRMED</small><strong>{money(confirmedContributions)}</strong><span>{payments.filter(p=>p.payment_status==='APPROVED').length} approved payments</span></div></div>
            <div className="dashboard-stat"><span className="stat-icon">↘</span><div><small>SPENT</small><strong>{money(totalExpenses)}</strong><span>{expenses.length} recorded expense{expenses.length===1?'':'s'}</span></div></div>
            <div className="dashboard-stat"><span className="stat-icon">⏳</span><div><small>AWAITING</small><strong>{awaitingCount}</strong><span>Payment{awaitingCount===1?'':'s'} to verify</span></div></div>
            <div className="dashboard-stat attention-stat"><span className="stat-icon">!</span><div><small>OUTSTANDING</small><strong>{money(pendingAmount)}</strong><span>{pendingMembers.length} members pending for {birthday.name}</span></div></div>
          </div>
        </section>

        <section className="dashboard-focus-grid">
          <div className="panel focus-card">
            <div className="focus-card-top"><div><span className="eyebrow">{birthday.name.toUpperCase()} · CELEBRATION STATUS</span><h3>{money(collected)} <small>/ {money(target)}</small></h3></div><div className="focus-percent">{progress}%</div></div>
            <div className="progress-track large"><span style={{width:`${progress}%`}} /></div>
            <div className="focus-meta"><span><b>{paidMembers.length}</b> paid</span><span><b>{awaitingMembers.length}</b> awaiting</span><span><b>{pendingMembers.length}</b> pending</span><span className="focus-due">{selectedBirthdayStatusLabel}</span></div>
          </div>
          <div className="panel next-card">
            <div className="section-title compact"><div><h3>Next celebration</h3><p>Keep the upcoming birthday in view.</p></div><span className="next-badge">{nextBirthdayLabel}</span></div>
            <div className="next-person"><span className="date-orb small-orb"><span>{nextBirthday?.date?.split(' ')[0] || '—'}</span><small>{nextBirthday?.date?.split(' ')[1]?.toUpperCase() || ''}</small></span><div><b>{nextBirthday?.name || '—'}</b><small>{nextBirthday?.isToday ? 'Birthday today 🎉' : 'Upcoming celebration'}</small></div></div>
          </div>
        </section>

        {session && signedInMember && <section className="member-glance">
          <div><span className="eyebrow">YOUR ACCOUNT</span><h3>Hi, {signedInMember.name.split(' ')[0]} 👋</h3><p>{signedInMemberRemaining > 0 ? `${money(signedInMemberRemaining)} is still due for ${birthday.name}.` : `Your contribution for ${birthday.name} is fully covered.`}</p></div>
          <div className={signedInMemberRemaining > 0 ? 'member-glance-status due' : 'member-glance-status paid'}>{signedInMemberRemaining > 0 ? 'Contribution due' : 'All paid'}<span>{signedInMemberRemaining > 0 ? money(signedInMemberRemaining) : '✓'}</span></div>
        </section>}

        <div className="content-grid">
          <section className="panel contributions">
            <div className="section-title">
              <div>
                <h3>Contributions</h3>
                <p>For {birthday.name}'s birthday · {money(standardContribution)} standard contribution</p>
              </div>
              <div className="tabs">
                {['all', 'pending', 'paid'].map(tab => (
                  <button key={tab} className={activeTab === tab ? 'active' : ''} onClick={() => setActiveTab(tab)}>
                    {tab[0].toUpperCase() + tab.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <div className="list-head"><span>MEMBER</span><span>STATUS</span><span>AMOUNT</span></div>
            <div className="member-list">
              {members
                .filter(member => {
                  const status = statusOf(member)?.status;
                  if (activeTab === 'paid') return status === 'Paid';
                  if (activeTab === 'pending') return !status;
                  return true;
                })
                .map(member => {
                  const st = statusOf(member);
                  const o = obligations.find(x => x.birthday_id === birthday.id && x.member_id === member.id);
                  const due = o ? (balanceByObligation.get(o.id)?.remaining || 0) : standardContribution;
                  const rowClass = st?.status === 'Paid' ? 'paid' : st?.status === 'Awaiting Verification' ? 'review' : 'pending';
                  const pillClass = st?.status === 'Paid' ? 'pill paid' : st?.status === 'Awaiting Verification' ? 'pill review' : 'pill pending';
                  const subLabel = st?.status === 'Paid'
                    ? 'Contribution confirmed'
                    : st?.status === 'Awaiting Verification'
                      ? 'Payment submitted'
                      : session
                        ? 'Click to contribute'
                        : 'Contribution due';
                  return (
                    <button
                      className={`member-row polished-row ${rowClass}`}
                      key={member.id}
                      onClick={() => setSelectedMemberDetail({ member, status: st, due, obligation: o })}
                    >
                      <span className="person">
                        <span className={st?.status === 'Paid' ? 'mini-avatar paid-avatar' : 'mini-avatar'}>{initials(member.name)}</span>
                        <span><b>{member.name}</b><small>{subLabel}</small></span>
                      </span>
                      <span className="member-status-wrap">
                        <span className={`status-dot ${rowClass}`}></span>
                        <span className={pillClass}>{st?.status || 'Pending'}</span>
                        <strong>{st ? money(st.amount) : money(due)}</strong>
                        {!st && session && <span className="row-action">Pay →</span>}
                      </span>
                    </button>
                  );
                })}
            </div>
          </section>
          <aside className="side-stack"><section className="panel pending-panel"><div className="section-title compact"><div><h3>Pending members</h3><p>{pendingMembers.length} still need to contribute</p></div><span className="count-badge">{pendingMembers.length}</span></div><div className="pending-list">{visiblePending.map(member=><button key={member.id} onClick={()=>openPayment(member.id)}><span className="mini-avatar pending-avatar">{initials(member.name)}</span><span><b>{member.name}</b><small>{money(statusOf(member)?.amount || birthdayObligations.find(o=>o.member_id===member.id)?.required_amount || standardContribution)} due</small></span><span className="arrow">→</span></button>)}</div>{pendingMembers.length>6&&<button className="show-more" onClick={()=>setShowAll(v=>!v)}>{showAll?'Show less':'View all pending'}</button>}</section><section className="panel upcoming-panel"><div className="section-title compact"><div><h3>Coming up</h3><p>Next celebrations after this one</p></div></div><div className="upcoming-list">{nextThreeBirthdays.map(b=><button key={b.id} onClick={()=>setSelected(birthdays.findIndex(x=>x.id===b.id))}><span className="up-date">{b.date}</span><span className="upcoming-person"><b>{b.name}</b><small>{b.isToday?'Today':b.next.toLocaleDateString('en-IN',{day:'numeric',month:'short'})}</small></span><span>›</span></button>)}</div></section></aside></div>

        <section className="panel activity-panel"><div className="section-title compact"><div><h3>Recent activity</h3><p>Latest contributions and fund spending.</p></div><span className="calendar-count">{recentActivity.length} recent</span></div><div className="activity-list">{recentActivity.length===0?<div className="admin-empty"><b>No activity yet.</b><span>Payments and expenses will appear here.</span></div>:recentActivity.map(item=>{const isExpense=item.type==='expense';const statusLabel=isExpense?'Expense':item.status==='APPROVED'?'Approved':item.status==='REJECTED'?'Rejected':'Awaiting';return <div className="activity-row" key={item.id}><span className={isExpense?'activity-icon expense':'activity-icon'}>{isExpense?'↘':'₹'}</span><div className="activity-main"><b>{isExpense?item.member:`${item.member} contributed`}</b><small>{isExpense?'Fund spending':statusLabel} · {item.date.getTime()?item.date.toLocaleDateString('en-IN',{day:'numeric',month:'short'}):'—'}</small></div><strong className={isExpense?'expense-amount':''}>{isExpense?'−':'+'}{money(item.amount)}</strong></div>})}</div></section>

      <section className="panel activity-panel">
        <div className="section-title compact">
          <div><h3>Recent activity</h3><p>The latest payments and fund spending.</p></div>
          {isAdmin && awaitingCount > 0 && <button type="button" className="review-cta" onClick={openAdmin}>Review {awaitingCount} pending</button>}
        </div>
        <div className="activity-list">
          {recentActivity.length === 0 ? <div className="activity-empty"><b>No activity yet.</b><span>Payments and expenses will appear here as the fund is used.</span></div> :
            recentActivity.map(item => {
              const payment = item.kind === 'payment';
              const label = payment ? (item.status === 'APPROVED' ? 'Approved' : item.status === 'REJECTED' ? 'Rejected' : 'Awaiting') : 'Expense';
              const icon = payment ? (item.status === 'APPROVED' ? '✓' : item.status === 'REJECTED' ? '×' : '↗') : '₹';
              return <div className={`activity-row ${payment ? 'payment-activity' : 'expense-activity'}`} key={item.id}>
                <span className="activity-icon">{icon}</span>
                <div className="activity-main"><b>{payment ? `${item.member} submitted a contribution` : `${item.member} expense recorded`}</b><small>{payment ? `${item.birthday} · ${label}` : item.birthday}</small></div>
                <div className="activity-value"><strong className={payment ? '' : 'expense-value'}>{payment ? '+' : '−'}{money(item.amount)}</strong><small>{item.date.getTime() ? item.date.toLocaleDateString('en-IN', {day:'numeric', month:'short'}) : '—'}</small></div>
              </div>
            })
          }
        </div>
      </section>



        <section className="panel timeline-panel"><div className="section-title compact"><div><h3>Birthday calendar</h3><p>Select any birthday to view its contribution status.</p></div><span className="calendar-count">{birthdays.length} celebrations</span></div><div className="timeline">{birthdays.map((b,i)=>{const birthdayProgressObligations=obligations.filter(o=>o.birthday_id===b.id);const birthdayCollected=birthdayProgressObligations.reduce((sum,o)=>sum+Number(balanceByObligation.get(o.id)?.paid||0)+Number(balanceByObligation.get(o.id)?.advance||0),0);const birthdayTarget=birthdayProgressObligations.reduce((sum,o)=>sum+Number(o.required_amount||0),0);const birthdayPct=birthdayTarget?Math.min(100,Math.round(birthdayCollected/birthdayTarget*100)):0;return <button className={i===selected?'timeline-item selected':'timeline-item'} key={b.id} onClick={()=>setSelected(i)}><span className="timeline-dot"></span><small>{b.date}</small><b>{b.name}</b><span className="timeline-mini-progress"><i style={{width:`${birthdayPct}%`}} /></span><em>{birthdayPct}%</em></button>})}</div></section>
      </div>

      {showExpense&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!expenseBusy)setShowExpense(false)}}><div className="modal expense-modal"><div className="modal-header"><div><span className="eyebrow">ADMIN · EXPENSE</span><h3>Add expense</h3><p>Record money spent from the shared birthday fund.</p></div><button type="button" onClick={()=>!expenseBusy&&setShowExpense(false)}>×</button></div><form onSubmit={addExpense}><label>Category<select value={expenseCategory} onChange={e=>setExpenseCategory(e.target.value)}><option>Cake</option><option>Shirt / Gift</option><option>Other</option></select></label><label>Amount<select value={expenseAmount} onChange={e=>setExpenseAmount(Number(e.target.value))}><option value={0}>Select amount</option>{Array.from({length:200},(_,i)=>(i+1)*50).map(v=><option key={v} value={v}>{money(v)}</option>)}</select></label><label>Date<input type="date" value={expenseDate} onChange={e=>setExpenseDate(e.target.value)} /></label><label>Description <span className="optional">optional</span><input value={expenseDescription} onChange={e=>setExpenseDescription(e.target.value)} placeholder="e.g. Chocolate truffle cake" /></label><button className="primary full" type="submit" disabled={expenseBusy}>{expenseBusy?'Saving…':'Save expense'}</button></form></div></div>}

      {selectedMemberDetail&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setSelectedMemberDetail(null)}}><div className="modal member-detail-modal"><div className="modal-header"><div><span className="eyebrow">CONTRIBUTION DETAILS</span><h3>{selectedMemberDetail.member.name}</h3><p>{birthday.name}'s birthday · {birthday.date}</p></div><button type="button" onClick={()=>setSelectedMemberDetail(null)}>×</button></div><div className="member-detail-hero"><span className="detail-avatar">{initials(selectedMemberDetail.member.name)}</span><div><b>{selectedMemberDetail.status?.status || (selectedMemberDetail.due>0?'Contribution due':'Paid')}</b><small>{selectedMemberDetail.status?.status==='Awaiting Verification'?'Payment submitted and waiting for admin approval.':selectedMemberDetail.due>0?'This contribution still needs to be covered.':'Contribution requirement is fully covered.'}</small></div></div><div className="detail-stats"><div><span>Required</span><strong>{money(selectedMemberDetail.obligation?.required_amount || standardContribution)}</strong></div><div><span>Paid / advance</span><strong>{money(Math.max(0,Number(selectedMemberDetail.obligation?.required_amount || standardContribution)-Number(selectedMemberDetail.due||0)))}</strong></div><div><span>Remaining</span><strong>{money(selectedMemberDetail.due)}</strong></div></div>{selectedMemberDetail.status?.status==='Awaiting Verification'?<div className="detail-note">Your latest payment is awaiting verification. You can contribute again after it is reviewed.</div>:selectedMemberDetail.due>0?(session?<button className="primary full" type="button" onClick={()=>{setSelectedMemberDetail(null);openPayment(selectedMemberDetail.member.id)}}>Add contribution · {money(selectedMemberDetail.due)} →</button>:<button className="primary full" type="button" onClick={()=>{setSelectedMemberDetail(null);setShowLogin(true)}}>Sign in to contribute →</button>):<div className="detail-complete">✓ Fully covered for this birthday</div>}</div></div>}

      {showPayment&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!submitting)setShowPayment(false)}}><div className="modal"><div className="modal-header"><div><span className="eyebrow">CONTRIBUTION</span><h3>Submit payment</h3><p>{payer?.name || 'Member'} · {birthday.name}'s birthday</p></div><button type="button" onClick={()=>!submitting&&setShowPayment(false)}>×</button></div><form onSubmit={submitPayment}>
        <label>Your name<select value={!isAdmin&&profile?.member_id?profile.member_id:person} onChange={e=>changePerson(e.target.value)} disabled={!isAdmin}>{members.map(member=><option key={member.id} value={member.id}>{member.name}</option>)}</select>{!isAdmin&&<span className="field-hint">This is linked to your account.</span>}</label>
        <label>Total amount<select value={amount} onChange={e=>updateAmount(e.target.value)}>{Array.from({length:100},(_,i)=>(i+1)*50).map(value=><option key={value} value={value}>{money(value)}</option>)}</select></label>
        <div className="allocation-box"><div className="allocation-heading"><div><b>Allocate this payment</b><small>Split one payment across multiple birthday obligations.</small></div><span>{money(allocatedTotal)} / {money(numericAmount)}</span></div>
          <div className="allocation-list">{allocationRows.map((row,index)=>{const option=payerBirthdayOptions.find(x=>x.obligationId===row.obligationId);return <div className="allocation-row" key={`${row.obligationId}-${index}`}><select value={row.obligationId} onChange={e=>{const v=e.target.value;setAllocationRows(rows=>rows.map((r,i)=>i===index?{...r,obligationId:v}:r))}}>{payerBirthdayOptions.map(x=><option key={x.obligationId} value={x.obligationId} disabled={allocationRows.some((r,i)=>i!==index&&r.obligationId===x.obligationId)}>{x.name} · {x.date} · {money(x.remaining)} left</option>)}</select><select value={row.amount} onChange={e=>updateAllocation(index,e.target.value)}>{Array.from({length:Math.floor(Math.min(Number(option?.remaining || 0), Math.max(0, numericAmount - allocationRows.reduce((sum, r, i) => i === index ? sum : sum + Number(r.amount || 0), 0)))/50)},(_,i)=>(i+1)*50).map(value=><option key={value} value={value}>{money(value)}</option>)}</select><button type="button" className="remove-allocation" onClick={()=>removeAllocation(index)}>×</button></div>})}</div>
          <button type="button" className="add-allocation" onClick={addAllocation}>＋ Add another birthday</button>
          <div className="allocation-summary"><span>Allocated <b>{money(allocatedTotal)}</b></span><span>Remaining <b>{money(unallocated)}</b></span></div>
          {unallocated>0&&<label className="advance-check"><input type="checkbox" checked={keepAsAdvance} onChange={e=>setKeepAsAdvance(e.target.checked)}/><span>Keep the remaining {money(unallocated)} as my advance for future birthdays.</span></label>}
        </div>
        <label>Payment screenshot<input type="file" accept="image/*" onChange={e=>setFile(e.target.files?.[0]||null)}/></label>
        {file&&<div className="file-preview"><span>✓</span><div><b>{file.name}</b><small>Ready to submit</small></div></div>}
        <button className="primary full" type="submit" disabled={submitting}>{submitting?'Submitting…':'Submit for verification'}</button>
      </form></div></div>}

      <style jsx>{`
        .member-detail-modal { max-width:520px; width:min(520px,calc(100vw - 32px)); }
        .member-detail-hero { display:flex; align-items:center; gap:14px; padding:16px; margin:4px 0 14px; border:1px solid rgba(255,255,255,.08); border-radius:12px; background:rgba(99,102,241,.07); }
        .detail-avatar { width:48px; height:48px; border-radius:50%; display:grid; place-items:center; background:linear-gradient(135deg,#6366f1,#22d3ee); color:#fff; font-weight:800; }
        .member-detail-hero b { display:block; font-size:16px; }
        .member-detail-hero small { display:block; color:#8d99ad; margin-top:4px; line-height:1.4; }
        .detail-stats { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; margin-bottom:14px; }
        .detail-stats > div { padding:12px; border:1px solid rgba(255,255,255,.07); border-radius:9px; background:rgba(255,255,255,.025); }
        .detail-stats span { display:block; color:#8d99ad; font-size:11px; margin-bottom:4px; }
        .detail-stats strong { font-size:17px; }
        .detail-note,.detail-complete { padding:12px 14px; border-radius:9px; background:rgba(245,158,11,.08); color:#f7d38b; font-size:13px; line-height:1.45; }
        .detail-complete { background:rgba(34,197,94,.08); color:#9be2af; text-align:center; }
        .admin-modal { max-width: 820px; width: min(820px, calc(100vw - 32px)); }
        .admin-tabs { display:flex; gap:8px; padding: 14px 0; border-bottom:1px solid rgba(255,255,255,.08); }
        .admin-tabs button { border:0; background:transparent; color:#9aa7bd; padding:9px 12px; border-radius:8px; cursor:pointer; }
        .admin-tabs button.active { background:rgba(99,102,241,.14); color:#fff; }
        .admin-tabs span { margin-left:5px; opacity:.7; }
        .admin-list { display:grid; gap:10px; max-height:52vh; overflow:auto; padding:14px 0; }
        .admin-payment { border:1px solid rgba(255,255,255,.08); padding:14px; border-radius:10px; background:rgba(255,255,255,.025); }
        .admin-payment-main { display:grid; grid-template-columns:auto 1fr auto; gap:12px; align-items:center; }
        .admin-payment-main small { display:block; color:#8d99ad; margin-top:3px; }
        .admin-payment-main strong { font-size:18px; }
        .admin-actions { display:flex; justify-content:flex-end; gap:8px; margin-top:12px; flex-wrap:wrap; }
        .admin-actions button { border:0; border-radius:7px; padding:9px 12px; cursor:pointer; }
        .secondary { background:#20283a; color:#dce3ef; }
        .approve-button { background:#1f9d63; color:white; }
        .danger-button { background:#6f2630; color:#ffdfe2; }
        .admin-empty { padding:28px 12px; text-align:center; color:#8d99ad; display:grid; gap:5px; }
        .admin-empty b { color:#e7ebf3; }
        .members-modal { max-width: 760px; }
        .member-account-list { display:grid; gap:10px; max-height:52vh; overflow:auto; padding:14px 0; }
        .member-account { display:grid; grid-template-columns:1fr minmax(180px, 260px); gap:14px; align-items:center; padding:14px; border:1px solid rgba(255,255,255,.08); border-radius:10px; background:rgba(255,255,255,.025); }
        .member-account small { display:block; color:#8d99ad; margin-top:4px; }
        .member-account select { width:100%; }
        .field-hint { display:block; color:#7f8ba0; font-size:12px; margin-top:5px; }
        .admin-note { font-size:12px; color:#7f8ba0; padding-top:10px; border-top:1px solid rgba(255,255,255,.08); }

        .dashboard-overview { display:grid; grid-template-columns:minmax(0,1.35fr) minmax(0,1fr); gap:12px; margin-top:14px; }
        .overview-hero { min-height:238px; padding:24px; border:1px solid rgba(99,102,241,.22); border-radius:14px; background:radial-gradient(circle at 85% 20%, rgba(34,211,238,.12), transparent 28%), linear-gradient(145deg, rgba(99,102,241,.16), rgba(255,255,255,.025)); display:flex; justify-content:space-between; gap:24px; align-items:center; }
        .overview-copy { min-width:0; }
        .overview-copy h2 { margin:8px 0 4px; font-size:38px; letter-spacing:-.03em; }
        .overview-copy h2 small { font-size:14px; color:#8d99ad; font-weight:600; letter-spacing:0; }
        .overview-copy p { margin:0; max-width:580px; color:#9aa7bd; line-height:1.55; font-size:13px; }
        .overview-progress { margin-top:22px; max-width:620px; }
        .overview-progress-head { display:flex; justify-content:space-between; margin-bottom:7px; color:#aeb8ca; font-size:12px; }
        .overview-progress-head b { color:#fff; }
        .overview-progress > small { display:block; color:#7f8ba0; margin-top:7px; font-size:11px; }
        .overview-orb { width:112px; height:112px; flex:0 0 112px; border-radius:50%; border:1px solid rgba(255,255,255,.12); background:rgba(7,12,28,.45); display:grid; place-items:center; align-content:center; box-shadow:0 0 0 10px rgba(99,102,241,.035); }
        .overview-orb span { font-size:26px; font-weight:800; }
        .overview-orb small { color:#7f8ba0; font-size:9px; letter-spacing:.12em; margin-top:-4px; }
        .overview-stats { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
        .overview-stats .dashboard-stat { min-height:0; }
        .attention-stat { border-color:rgba(245,158,11,.18); }
        .dashboard-focus-grid { display:grid; grid-template-columns:minmax(0,1.5fr) minmax(280px,1fr); gap:12px; margin-top:12px; }
        .focus-card, .next-card { min-height:176px; padding:18px; }
        .focus-card-top { display:flex; align-items:center; justify-content:space-between; gap:16px; }
        .focus-card h3 { margin:5px 0 0; font-size:27px; }
        .focus-card h3 small { color:#7f8ba0; font-size:13px; font-weight:500; }
        .focus-percent { font-size:26px; font-weight:800; }
        .progress-track.large { height:9px; margin-top:18px; }
        .focus-meta { display:flex; gap:16px; flex-wrap:wrap; margin-top:14px; color:#7f8ba0; font-size:11px; }
        .focus-meta b { color:#dfe6f2; }
        .focus-due { margin-left:auto; color:#aeb8ca; }
        .next-badge, .calendar-count { font-size:10px; padding:6px 8px; border-radius:999px; background:rgba(99,102,241,.12); color:#b9c1ff; white-space:nowrap; }
        .next-person { display:flex; align-items:center; gap:13px; margin-top:18px; }
        .small-orb { width:58px; height:58px; flex:0 0 58px; }
        .small-orb span { font-size:19px; }
        .small-orb small { font-size:8px; }
        .next-person b { display:block; font-size:20px; }
        .next-person small { display:block; color:#7f8ba0; margin-top:4px; }
        .member-glance { margin-top:12px; padding:15px 18px; border:1px solid rgba(34,211,238,.15); border-radius:12px; background:rgba(34,211,238,.045); display:flex; align-items:center; justify-content:space-between; gap:16px; }
        .member-glance h3 { margin:4px 0 2px; font-size:17px; }
        .member-glance p { margin:0; color:#8d99ad; font-size:12px; }
        .member-glance-status { min-width:118px; text-align:right; font-size:11px; color:#8d99ad; }
        .member-glance-status span { display:block; font-size:17px; font-weight:800; margin-top:2px; }
        .member-glance-status.paid span { color:#4ade80; }
        .member-glance-status.due span { color:#fbbf24; }
        .upcoming-person { flex:1; min-width:0; }
        .upcoming-person b, .upcoming-person small { display:block; }
        .upcoming-person small { color:#7f8ba0; margin-top:2px; }
        .timeline-item { position:relative; }
        .timeline-mini-progress { display:block; width:100%; height:3px; background:rgba(255,255,255,.07); border-radius:99px; margin-top:6px; overflow:hidden; }
        .timeline-mini-progress i { display:block; height:100%; background:currentColor; border-radius:99px; opacity:.8; }
        .timeline-item em { display:block; font-style:normal; font-size:9px; color:#6f7b90; margin-top:4px; }
        .overview-side { display:flex; flex-direction:column; align-items:center; gap:12px; }
        .overview-action { border:1px solid rgba(245,158,11,.25); background:rgba(245,158,11,.09); color:#fbbf24; padding:8px 11px; border-radius:8px; font-size:11px; cursor:pointer; white-space:nowrap; }
        .overview-action:hover { background:rgba(245,158,11,.14); }
        .paid-avatar { box-shadow:0 0 0 2px rgba(74,222,128,.18); }
        .row-action { color:#aeb8ff; font-size:10px; font-weight:700; white-space:nowrap; }
        .activity-panel { margin-top:12px; }
        .activity-list { display:grid; }
        .activity-row { display:grid; grid-template-columns:auto 1fr auto; align-items:center; gap:12px; padding:13px 2px; border-top:1px solid rgba(255,255,255,.06); }
        .activity-row:first-child { border-top:0; }
        .activity-icon { width:34px; height:34px; border-radius:10px; display:grid; place-items:center; background:rgba(99,102,241,.12); color:#c3c7ff; font-weight:800; }
        .activity-icon.expense { background:rgba(245,158,11,.10); color:#fbbf24; }
        .activity-main b, .activity-main small { display:block; }
        .activity-main small { color:#7f8ba0; margin-top:3px; font-size:11px; }
        .activity-row strong { font-size:14px; }
        .expense-amount { color:#fbbf24; }
        .dashboard-summary { display:grid; grid-template-columns:2fr repeat(2,1fr); gap:12px; margin-top:14px; }
        .dashboard-progress-card { grid-row:span 2; min-height:190px; }
        .dashboard-stat { min-height:88px; border:1px solid rgba(255,255,255,.08); background:rgba(255,255,255,.025); padding:16px; border-radius:10px; display:flex; align-items:center; gap:12px; }
        .dashboard-stat.highlight { background:linear-gradient(135deg,rgba(99,102,241,.13),rgba(34,211,238,.06)); border-color:rgba(99,102,241,.2); }
        .dashboard-stat .stat-icon { width:36px; height:36px; border-radius:10px; display:grid; place-items:center; flex:0 0 36px; background:rgba(255,255,255,.06); color:#dce3ef; font-weight:800; }
        .dashboard-stat small { display:block; color:#8d99ad; font-size:10px; letter-spacing:.08em; }
        .dashboard-stat strong { display:block; font-size:21px; margin-top:3px; }
        .dashboard-stat span:last-child { display:block; color:#7f8ba0; font-size:11px; margin-top:3px; }
        .compact-stat { min-height:78px; }
        .compact-stat strong { font-size:16px; }

        .fund-balance-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; margin-top:14px; }
        .balance-card { border:1px solid rgba(255,255,255,.08); background:rgba(255,255,255,.025); padding:18px; border-radius:10px; display:grid; gap:5px; }
        .balance-card small { color:#8d99ad; letter-spacing:.08em; font-size:11px; }
        .balance-card strong { font-size:24px; }
        .balance-card span { color:#7f8ba0; font-size:12px; }
        .negative { color:#ff7d86; }
        .expense-section { margin-top:16px; padding:16px; border-top:1px solid rgba(255,255,255,.08); background:#141d37; border-radius:10px; }
        .expense-header { display:flex; justify-content:space-between; align-items:flex-start; gap:16px; }
        .expense-header h4 { margin:3px 0; font-size:18px; }
        .expense-header p { margin:0; color:#8d99ad; font-size:12px; }
        .expense-summary { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; margin:14px 0; }
        .expense-summary > div { background:rgba(255,255,255,.025); border:1px solid rgba(255,255,255,.07); padding:10px; border-radius:8px; display:grid; gap:3px; }
        .expense-summary small { color:#8d99ad; }
        .expense-summary b { font-size:16px; }
        .expense-list { display:grid; gap:8px; max-height:220px; overflow:auto; }
        .expense-row { display:grid; grid-template-columns:1fr auto auto; align-items:center; gap:10px; padding:10px 12px; border:1px solid rgba(255,255,255,.07); border-radius:8px; }
        .expense-row small { display:block; color:#8d99ad; margin-top:3px; }
        .expense-row .danger-button { padding:7px 9px; }
        .expense-modal { max-width:520px; }
        .optional { color:#7f8ba0; font-weight:400; }
        @media (max-width:760px) {
          .nav { padding:10px 14px; }
          .nav-actions { gap:4px; }
          .nav-link { padding:8px 7px; font-size:12px; }
          .brand span { display:none; }
          .brand strong { font-size:15px; }
          .page { padding:18px 12px 32px; }
          .page-heading { flex-direction:column; align-items:stretch; gap:14px; }
          .page-heading .primary { width:100%; }
          .birthday-banner { flex-direction:column; gap:16px; }
          .birthday-picker { width:100%; }
          .birthday-picker select { width:100%; }
          .dashboard-overview { grid-template-columns:1fr; }
          .overview-hero { min-height:0; }
          .overview-side { flex-direction:row; justify-content:flex-start; }
          .overview-action { flex:1; }
          .dashboard-focus-grid { grid-template-columns:1fr; }
          .dashboard-summary { grid-template-columns:1fr 1fr; }
          .dashboard-progress-card { grid-column:1 / -1; grid-row:auto; min-height:0; }
          .dashboard-stat { min-height:82px; padding:13px; }
          .dashboard-stat strong { font-size:18px; }
          .compact-stat { grid-column:span 1; }
          .fund-balance-grid { grid-template-columns:1fr; }
          .expense-summary { grid-template-columns:1fr; }
          .expense-header { flex-direction:column; }
          .expense-header button { width:100%; }
          .expense-row { grid-template-columns:1fr auto; }
          .expense-row .danger-button { grid-column:2; }
          .content-grid { grid-template-columns:1fr !important; }
          .list-head { display:none; }
          .member-row { grid-template-columns:1fr auto; gap:8px; }
          .member-row .pill { justify-self:end; }
          .member-row > strong { grid-column:2; }
          .detail-stats { grid-template-columns:1fr; }
          .member-detail-hero { align-items:flex-start; }
          .tabs { width:100%; }
          .tabs button { flex:1; }
          .timeline { overflow-x:auto; padding-bottom:8px; }
          .timeline-item { min-width:88px; }
          .modal { width:calc(100vw - 20px); max-height:92vh; overflow:auto; padding:16px; }
          .admin-modal, .members-modal, .expense-modal { width:calc(100vw - 20px); }
          .member-account { grid-template-columns:1fr; }
          .admin-actions { display:grid; grid-template-columns:1fr 1fr; }
          .admin-actions .secondary { grid-column:1 / -1; }
        }
        @media (max-width:420px) {
          .nav-link { font-size:0; padding:8px 6px; }
          .nav-link:first-child { font-size:12px; }
          .avatar-button { width:32px; height:32px; }
          .overview-hero { padding:18px; }
          .overview-copy h2 { font-size:31px; }
          .overview-orb { width:82px; height:82px; flex-basis:82px; }
          .overview-orb span { font-size:21px; }
          .overview-stats { grid-template-columns:1fr; }
          .member-glance { align-items:flex-start; flex-direction:column; }
          .overview-side { width:100%; }
          .overview-action { width:100%; }
          .member-glance-status { text-align:left; }
          .focus-due { margin-left:0; width:100%; }
          .dashboard-summary { grid-template-columns:1fr; }
          .dashboard-progress-card, .compact-stat { grid-column:auto; }
          .dashboard-stat { min-height:76px; }
          .birthday-banner { padding:14px; }
          .date-orb { width:58px; height:58px; }
          .date-orb span { font-size:20px; }
        }
      `}</style>
      {toast&&<div className="toast"><span>●</span>{toast}</div>}
    </main>
  );
}
