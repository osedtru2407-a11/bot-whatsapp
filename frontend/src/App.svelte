<script>
  import { onMount, onDestroy } from 'svelte';
  import { isAuthenticated, checkAuth } from './stores/auth';
  import { loadCompanies, currentCompanyId } from './stores/company';
  import { startStatusPolling, stopStatusPolling, fetchBotStatus } from './stores/botStatus';
  import { loadRules } from './stores/rules';
  import { loadSchedules } from './stores/schedules';
  import { loadLeads } from './stores/leads';
  import { loadLibrary } from './stores/library';
  import { loadSettings } from './stores/settings';
  import { loadTeamData } from './stores/team';
  import { activeTab } from './stores/ui';

  // Layout Components
  import Header from './components/layout/Header.svelte';
  import NavTabs from './components/layout/NavTabs.svelte';
  import ToastContainer from './components/layout/ToastContainer.svelte';

  // Modals
  import LoginModal from './components/auth/LoginModal.svelte';
  import ChangePasswordModal from './components/auth/ChangePasswordModal.svelte';
  import QrModal from './components/qr/QrModal.svelte';
  import CompanyModal from './components/company/CompanyModal.svelte';
  import RuleModal from './components/rules/RuleModal.svelte';
  import ScheduleModal from './components/scheduler/ScheduleModal.svelte';
  import LeadFilesModal from './components/leads/LeadFilesModal.svelte';
  import LibraryUploadModal from './components/library/LibraryUploadModal.svelte';
  import LibraryViewModal from './components/library/LibraryViewModal.svelte';
  import InviteUserModal from './components/team/InviteUserModal.svelte';
  import EditRoleModal from './components/team/EditRoleModal.svelte';
  import CustomRoleModal from './components/team/CustomRoleModal.svelte';

  // Tab Content Modules
  import RulesTab from './components/rules/RulesTab.svelte';
  import SchedulerTab from './components/scheduler/SchedulerTab.svelte';
  import SimulatorTab from './components/simulator/SimulatorTab.svelte';
  import QuickSendTab from './components/quicksend/QuickSendTab.svelte';
  import LeadsTab from './components/leads/LeadsTab.svelte';
  import LibraryTab from './components/library/LibraryTab.svelte';
  import SettingsTab from './components/settings/SettingsTab.svelte';
  import TeamTab from './components/team/TeamTab.svelte';

  async function refreshAllCompanyData() {
    await Promise.all([
      fetchBotStatus(),
      loadRules(),
      loadSchedules(),
      loadLeads(),
      loadLibrary(),
      loadSettings(),
      loadTeamData()
    ]);
  }

  onMount(async () => {
    const isAuth = await checkAuth();
    if (isAuth) {
      await loadCompanies();
      startStatusPolling(3500);
      await refreshAllCompanyData();
    }
  });

  onDestroy(() => {
    stopStatusPolling();
  });

  // Watch for auth state changes
  $effect(() => {
    if ($isAuthenticated) {
      startStatusPolling(3500);
    } else {
      stopStatusPolling();
    }
  });
</script>

<div class="app-root">
  <Header onCompanySwitched={refreshAllCompanyData} />

  <main class="app-main">
    <NavTabs />

    <div class="tab-viewport">
      {#if $activeTab === 'tab-rules'}
        <RulesTab />
      {:else if $activeTab === 'tab-scheduler'}
        <SchedulerTab />
      {:else if $activeTab === 'tab-simulator'}
        <SimulatorTab />
      {:else if $activeTab === 'tab-quick-send'}
        <QuickSendTab />
      {:else if $activeTab === 'tab-leads'}
        <LeadsTab />
      {:else if $activeTab === 'tab-library'}
        <LibraryTab />
      {:else if $activeTab === 'tab-settings'}
        <SettingsTab />
      {:else if $activeTab === 'tab-team'}
        <TeamTab />
      {/if}
    </div>
  </main>

  <!-- Modales Globales Modulares -->
  <LoginModal />
  <ChangePasswordModal />
  <QrModal />
  <CompanyModal />
  <RuleModal />
  <ScheduleModal />
  <LeadFilesModal />
  <LibraryUploadModal />
  <LibraryViewModal />
  <InviteUserModal />
  <EditRoleModal />
  <CustomRoleModal />

  <!-- Toast Floating Container -->
  <ToastContainer />
</div>

<style>
  .app-root {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }

  .tab-viewport {
    padding-top: 10px;
  }
</style>
