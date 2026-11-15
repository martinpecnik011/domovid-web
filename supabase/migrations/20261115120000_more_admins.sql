-- Three more admin accounts (Dominik, Teo, Filip). Each still needs MFA (aal2) before staff access opens.
insert into public.staff_emails (email) values
  ('domco1413@gmail.com'),
  ('pixormatiasko@gmail.com'),
  ('fifohav@gmail.com')
on conflict (email) do nothing;
