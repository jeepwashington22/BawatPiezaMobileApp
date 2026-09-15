-- ============================================================
-- BawatPieza - Welcome Email Notification Trigger
-- Run this in: Supabase Dashboard > SQL Editor > New query
-- ============================================================

-- Create the function that sends welcome emails via Edge Function
create or replace function public.send_welcome_email()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  user_data jsonb;
  first_name text;
  full_name text;
  subject text := 'Welcome to BawatPieza! 🎉';
  email_body text;
begin
  -- Get the newly created user's data
  user_data := row_to_json(new);
  first_name := coalesce((user_data->'raw_user_meta_data'->>'firstname')::text, 
                         split_part(coalesce((user_data->'raw_user_meta_data'->>'full_name')::text, new.email), ' ', 1),
                         'there');
  full_name := coalesce((user_data->'raw_user_meta_data'->>'full_name')::text, new.email);
  
  -- Build the welcome email content
  email_body := format('
    Hi %s,

    Welcome to BawatPieza! 🎉

    Thank you for joining BawatPieza! We''re excited to have you on board.

    Get started by signing in to your account and exploring all the features we have to offer.

    Sign In: https://bawatpieza.com/

    If you have any questions, feel free to reach out to our support team.

    Happy exploring! 🚀
  ', first_name);

  -- Call the Edge Function to send the email
  -- This requires the Edge Function to be deployed first
  perform net.http_post(
    url := 'https://' || coalesce(current_setting('supabase.url', true), 'YOUR_PROJECT.supabase.co') || '/functions/v1/welcome-email',
    headers := json_build_object('Content-Type', 'application/json'),
    body := json_build_object(
      'email', new.email,
      'full_name', full_name,
      'first_name', first_name,
      'created_at', to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
    )::text
  );

  return new;
end;
$$;

-- Create the trigger to send welcome email on new user creation
drop trigger if exists on_user_welcome_email on auth.users;
create trigger on_user_welcome_email
  after insert on auth.users
  for each row
  when (new.email is not null)
  execute function public.send_welcome_email();

-- Note: To enable this trigger, you need to:
-- 1. Deploy the welcome-email Edge Function to your Supabase project
-- 2. Make sure EXTERNAL_URL is set in your Supabase project settings
-- 3. The Edge Function will handle the actual email sending via your email service