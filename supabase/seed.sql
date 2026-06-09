insert into public.branches (name, address, short_address, city)
values
  ('Simba Supermarket Remera', '3336+MHV Union Trade Centre, 1 KN 4 Ave, Kigali', 'Union Trade Centre, KN 4 Ave', 'Kigali'),
  ('Simba Supermarket Kimironko', '342F+3V5, Kimironko, Kigali, RW', 'Kimironko, Kigali', 'Kigali'),
  ('Simba Supermarket Kacyiru', 'KN 5 Rd, Kigali', 'KN 5 Rd', 'Kigali'),
  ('Simba Supermarket Nyamirambo', '23H4+26V, Kigali', 'Nyamirambo, Kigali', 'Kigali'),
  ('Simba Supermarket Gikondo', '24G3+MCV, Kigali', 'Gikondo, Kigali', 'Kigali'),
  ('Simba Supermarket Kanombe', 'KK 35 Ave, Kigali', 'KK 35 Ave', 'Kigali'),
  ('Simba Supermarket Kinyinya', 'KG 541 St, Kigali', 'KG 541 St', 'Kigali'),
  ('Simba Supermarket Kibagabaga', '24Q5+R2R, Kigali', 'Kibagabaga, Kigali', 'Kigali'),
  ('Simba Supermarket Nyanza', '24XF+XVV, KG 192 St, Kigali', 'KG 192 St', 'Kigali')
on conflict (name) do update set
  address = excluded.address,
  short_address = excluded.short_address,
  city = excluded.city;
