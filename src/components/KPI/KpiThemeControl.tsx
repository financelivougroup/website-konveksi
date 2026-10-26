import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { DropdownMenu,DropdownMenuContent,DropdownMenuItem,DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
export function KpiThemeControl(){const {setTheme}=useTheme();return <DropdownMenu><DropdownMenuTrigger asChild><Button size="sm" variant="outline" aria-label="Pilih tema tampilan">Tema</Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={()=>setTheme('light')}>Terang</DropdownMenuItem><DropdownMenuItem onSelect={()=>setTheme('dark')}>Gelap</DropdownMenuItem><DropdownMenuItem onSelect={()=>setTheme('system')}>Ikuti sistem</DropdownMenuItem></DropdownMenuContent></DropdownMenu>;}
