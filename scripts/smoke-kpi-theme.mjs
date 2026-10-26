// Service-free fixture of real shared/KPI components for light/dark computed-style checks.
import { build } from 'esbuild';
import { mkdirSync,readFileSync,writeFileSync } from 'node:fs';
import path from 'node:path';
import http from 'node:http';
const out=path.resolve('.scratch/kpi-theme');mkdirSync(out,{recursive:true});
await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
 import React from 'react';import {createRoot} from 'react-dom/client';import {ThemeProvider,useTheme} from 'next-themes';
 import {Button} from './src/components/ui/button';import {Card,CardHeader,CardTitle,CardContent} from './src/components/ui/card';
 import {Input} from './src/components/ui/input';import {Badge} from './src/components/reui/badge';import {DataTable} from './src/components/Table/DataTable';
 import {AppSelect} from './src/components/AppSelect';import {KpiHeader} from './src/components/KPI/KpiShell';
 import {KpiGauge,KpiTrendChart} from './src/components/KPI/KpiTeamCharts';
 import {Tabs,TabsList,TabsTrigger} from './src/components/ui/tabs';
 function Fixture(){const{setTheme}=useTheme();return <main className="min-h-screen space-y-4 bg-background p-4 text-foreground">
 <div className="flex gap-2"><Button onClick={()=>setTheme('light')}>Fixture Light</Button><Button onClick={()=>setTheme('dark')}>Fixture Dark</Button></div>
 <KpiHeader judul="Kinerja Pribadi" subjudul="Fixture tanpa data produksi" tampilan="navy" mode="bulan" onModeChange={()=>{}} onRefresh={()=>{}} />
 <Card id="theme-card"><CardHeader><CardTitle>Permukaan kartu</CardTitle></CardHeader><CardContent className="space-y-3">
 <Input id="theme-input" defaultValue="Nilai input" /><div className="flex gap-2"><Badge variant="destructive-light">Perlu perhatian</Badge><Badge variant="success-light">Tercapai</Badge></div>
 <AppSelect label="Pilihan" value="one" options={[{value:'one',label:'Pilihan satu'},{value:'two',label:'Pilihan dua'}]} />
 <Tabs defaultValue="a"><TabsList><TabsTrigger value="a">Aktif</TabsTrigger><TabsTrigger value="b">Lainnya</TabsTrigger></TabsList></Tabs>
 <div id="theme-table"><DataTable variant="plain" columns={[{key:'nama',label:'Nama',width:'160px'},{key:'pcs',label:'Jumlah',width:'120px'}]} data={[{id:1,nama:'Fixture',pcs:10},{id:2,nama:'Kedua',pcs:20}]} /></div>
 </CardContent></Card>
 <KpiGauge current={74} goal={100} title="Produksi Jahit" />
 <KpiTrendChart title="Tren Fixture" data={[{bulan:'2026-09',target:100,realisasi:70},{bulan:'2026-10',target:120,realisasi:110}]} />
 </main>;}
 createRoot(document.getElementById('root')).render(<ThemeProvider attribute="class" defaultTheme="light"><Fixture /></ThemeProvider>);
`},bundle:true,format:'esm',platform:'browser',jsx:'automatic',outfile:path.join(out,'app.js'),alias:{'@':path.resolve('src')},define:{'process.env.NODE_ENV':'"development"','import.meta.env':'{}'},plugins:[{name:'no-db',setup(b){b.onResolve({filter:/^@\/lib\/supabase$/},()=>({path:'no-db',namespace:'stub'}));b.onLoad({filter:/.*/,namespace:'stub'},()=>({contents:'export const supabase=new Proxy({},{get(){throw new Error("Unexpected DB access")}});'}));b.onResolve({filter:/^@\/services\/kpiProduksi$/},()=>({path:'service',namespace:'service'}));b.onLoad({filter:/.*/,namespace:'service'},()=>({contents:'export const bulanBerjalan=()=>"2026-10";'}));}}]});
writeFileSync(path.join(out,'index.html'),'<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><title>Theme fixture</title></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>');
if(!process.argv.includes('--build-only'))http.createServer((req,res)=>{const name=req.url==='/app.js'?'app.js':req.url==='/style.css'?'style.css':'index.html';res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html');try{res.end(readFileSync(path.join(out,name)));}catch{res.statusCode=404;res.end('Not found');}}).listen(4191,'127.0.0.1',()=>console.log('Theme fixture http://127.0.0.1:4191 (no database)'));
