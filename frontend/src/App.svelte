<script>
    import { onMount, onDestroy } from 'svelte';
    import { isAuthenticated, checkAuth, isSuperadmin } from './stores/auth';
    import { loadCompanies, currentCompanyId } from './stores/company';
    import {
        startStatusPolling,
        stopStatusPolling,
        fetchBotStatus,
    } from './stores/botStatus';
    import { loadRules } from './stores/rules';
    import { loadSchedules } from './stores/schedules';
    import {
        loadLeads,
        initCompanyRealtimeEvents,
        stopCompanyRealtimeEvents,
    } from './stores/leads';
    import { loadGroups } from './stores/groups';
    import { loadContacts } from './stores/contacts';
    import { loadLibrary } from './stores/library';
    import { loadSettings } from './stores/settings';
    import { loadTeamData } from './stores/team';
    import { activeTab } from './stores/ui';

    // Layout Components
    import Header from './components/layout/Header.svelte';
    import Sidebar from './components/layout/Sidebar.svelte';
    import ToastContainer from './components/layout/ToastContainer.svelte';

    // Modals
    import LoginModal from './components/auth/LoginModal.svelte';
    import ChangePasswordModal from './components/auth/ChangePasswordModal.svelte';
    import QrModal from './components/qr/QrModal.svelte';
    import CompanyModal from './components/company/CompanyModal.svelte';
    import RuleModal from './components/rules/RuleModal.svelte';
    import ScheduleModal from './components/scheduler/ScheduleModal.svelte';
    import LeadFilesModal from './components/leads/LeadFilesModal.svelte';
    import LeadChatModal from './components/leads/LeadChatModal.svelte';
    import ImportContactsModal from './components/leads/ImportContactsModal.svelte';
    import GroupsModal from './components/leads/GroupsModal.svelte';
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
    import SuperAdminTab from './components/superadmin/SuperAdminTab.svelte';

    async function refreshAllCompanyData() {
        await Promise.all([
            fetchBotStatus(),
            loadRules(),
            loadSchedules(),
            loadLeads(),
            loadContacts(),
            loadGroups(),
            loadLibrary(),
            loadSettings(),
            loadTeamData(),
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
        stopCompanyRealtimeEvents();
    });

    // Watch for auth state changes
    $effect(() => {
        if ($isAuthenticated) {
            loadCompanies().then((comps) => {
                if (comps && comps.length > 0) {
                    refreshAllCompanyData();
                } else if ($isSuperadmin) {
                    activeTab.set('tab-superadmin');
                }
            });
            startStatusPolling(3500);
        } else {
            stopStatusPolling();
            stopCompanyRealtimeEvents();
        }
    });

    // Sincronizar stream de eventos en tiempo real al cambiar de empresa
    $effect(() => {
        if ($isAuthenticated && $currentCompanyId) {
            initCompanyRealtimeEvents($currentCompanyId);
        }
    });

    // Bloquear acceso a tab-superadmin si el usuario no es superadmin
    $effect(() => {
        if (!$isSuperadmin && $activeTab === 'tab-superadmin') {
            activeTab.set('tab-rules');
        }
    });
</script>

{#if $isAuthenticated}
    <div class="app-root">
        <Header onCompanySwitched={refreshAllCompanyData} />

        <div class="app-body-layout">
            <Sidebar />

            <main class="app-content-viewport">
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
                {:else if $activeTab === 'tab-superadmin' && $isSuperadmin}
                    <SuperAdminTab />
                {/if}
            </main>
        </div>

        <!-- Modales Operativos (Solo existen con sesión iniciada) -->
        <ChangePasswordModal />
        <QrModal />
        <CompanyModal />
        <RuleModal />
        <ScheduleModal />
        <LeadFilesModal />
        <LeadChatModal />
        <ImportContactsModal />
        <GroupsModal />
        <LibraryUploadModal />
        <LibraryViewModal />
        <InviteUserModal />
        <EditRoleModal />
        <CustomRoleModal />

        <ToastContainer />
    </div>
{:else}
    <!-- Pantalla completa de Inicio de Sesión / Registro: NINGÚN componente ni dato del dashboard se monta -->
    <LoginModal />
    <ToastContainer />
{/if}

<style>
    .app-root {
        min-height: 100vh;
        display: flex;
        flex-direction: column;
        background: var(--bg-dark);
    }

    .app-body-layout {
        display: flex;
        flex: 1;
        min-height: calc(100vh - 67px);
        width: 100%;
        position: relative;
    }

    .app-content-viewport {
        flex: 1;
        min-width: 0;
        padding: 24px 32px 60px 32px;
        max-width: 1440px;
        margin: 0 auto;
        width: 100%;
    }

    @media (max-width: 768px) {
        .app-content-viewport {
            padding: 16px 12px 60px 12px;
        }
    }
</style>
