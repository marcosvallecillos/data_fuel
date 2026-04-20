import { Routes } from '@angular/router';
import { DashboardComponent } from './core/features/dashboard/dashboard.component';

export const routes: Routes = [
    {
        path: '',
        redirectTo: '/dashboard',
        pathMatch: 'full'
    },
    {
        path: 'dashboard',
        component: DashboardComponent
    },
    {
        path: 'favoritos',
        loadComponent: () => import('./core/features/favoritos/favoritos.component').then(m => m.FavoritosComponent)
    },
    {
        path: '**',
        redirectTo: '/dashboard'
    }
];