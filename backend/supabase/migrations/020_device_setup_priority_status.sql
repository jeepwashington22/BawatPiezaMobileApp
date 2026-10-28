-- Store an allocation priority status on every configured device channel.
update public.device_setups
set setup_payload = jsonb_set(
  setup_payload,
  '{channels}',
  (
    select jsonb_agg(
      case
        when channel.value ->> 'priority_status' in ('low', 'medium', 'high')
          then channel.value
        else channel.value || '{"priority_status":"medium"}'::jsonb
      end
      order by channel.ordinal
    )
    from jsonb_array_elements(setup_payload -> 'channels')
      with ordinality as channel(value, ordinal)
  )
);

create function public.device_setup_has_valid_channel_priorities(payload jsonb)
returns boolean
language sql
immutable
parallel safe
as $$
  select case
    when jsonb_typeof(payload -> 'channels') <> 'array' then false
    else not exists (
      select 1
      from jsonb_array_elements(payload -> 'channels') as channel(value)
      where jsonb_typeof(channel.value) <> 'object'
        or coalesce(
          channel.value ->> 'priority_status' not in ('low', 'medium', 'high'),
          true
        )
    )
  end
$$;

alter table public.device_setups
  add constraint device_setups_channel_priority_status_check
  check (public.device_setup_has_valid_channel_priorities(setup_payload));