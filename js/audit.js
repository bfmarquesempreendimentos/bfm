/**
 * Auditoria - Retorna quem executou a ação (Admin, AdminSuper, Corretor, Cliente).
 * Usado para gravar createdBy/updatedBy em registros.
 * Compatível com IE11.
 */
(function (global) {
    'use strict';

    function getSuperAdminEmails() {
        if (typeof CONFIG !== 'undefined' && CONFIG.auth && CONFIG.auth.superAdminEmails) {
            return CONFIG.auth.superAdminEmails;
        }
        return ['brunoferreiramarques@gmail.com'];
    }

    function isSuperAdminEmail(email) {
        var list = getSuperAdminEmails();
        for (var i = 0; i < list.length; i++) {
            if (list[i] === email) return true;
        }
        return false;
    }

    /**
     * Retorna { type, email, name } do usuário atual ou null.
     * type: 'AdminSuper' | 'Admin' | 'Corretor' | 'Cliente'
     */
    function getCurrentActor() {
        var adminUser = null;
        try {
            var raw = localStorage.getItem('adminUser');
            if (raw) adminUser = JSON.parse(raw);
        } catch (e) {}
        if (adminUser && adminUser.email) {
            var type = isSuperAdminEmail(adminUser.email) ? 'AdminSuper' : 'Admin';
            return {
                type: type,
                email: adminUser.email || '',
                name: adminUser.name || 'Admin'
            };
        }
        var currentUser = null;
        try {
            raw = localStorage.getItem('currentUser');
            if (raw) currentUser = JSON.parse(raw);
        } catch (e) {}
        if (currentUser && (currentUser.email || currentUser.name)) {
            return {
                type: 'Corretor',
                email: currentUser.email || '',
                name: currentUser.name || 'Corretor'
            };
        }
        var currentClient = null;
        try {
            raw = localStorage.getItem('currentClient');
            if (raw) currentClient = JSON.parse(raw);
        } catch (e) {}
        if (currentClient && (currentClient.email || currentClient.name)) {
            return {
                type: 'Cliente',
                email: currentClient.email || '',
                name: currentClient.name || 'Cliente'
            };
        }
        return null;
    }

    /**
     * Adiciona createdBy ao objeto (para novos registros).
     */
    function addCreatedBy(obj) {
        var actor = getCurrentActor();
        if (actor) {
            obj.createdBy = {
                type: actor.type,
                email: actor.email,
                name: actor.name,
                at: new Date().toISOString()
            };
        }
        return obj;
    }

    /**
     * Adiciona updatedBy ao objeto (para alterações).
     */
    function addUpdatedBy(obj) {
        var actor = getCurrentActor();
        if (actor) {
            obj.updatedBy = {
                type: actor.type,
                email: actor.email,
                name: actor.name,
                at: new Date().toISOString()
            };
        }
        return obj;
    }

    if (typeof global !== 'undefined') {
        global.getCurrentActor = getCurrentActor;
        global.addCreatedBy = addCreatedBy;
        global.addUpdatedBy = addUpdatedBy;
    }
})(typeof window !== 'undefined' ? window : this);
