-- Normalize existing channel priorities before restricting saved setup payloads.
update public.device_setups as device_setup
set setup_payload = jsonb_set(
  device_setup.setup_payload,
  '{channels}',
  (
    select coalesce(
      jsonb_agg(
        case
          when jsonb_typeof(channel.value) = 'object' then
            case
              when channel.value ? 'allocation_priority' then jsonb_set(
                jsonb_set(
                  channel.value,
                  '{priority_status}',
                  to_jsonb(
                    case
                      when channel.value ->> 'priority_status' = 'high' then 'high'
                      else 'low'
                    end
                  ),
                  true
                ),
                '{allocation_priority}',
                to_jsonb(
                  case
                    when channel.value ->> 'allocation_priority' = 'high' then 'high'
                    else 'low'
                  end
                ),
                true
              )
              else jsonb_set(
                channel.value,
                '{priority_status}',
                to_jsonb(
                  case
                    when channel.value ->> 'priority_status' = 'high' then 'high'
                    else 'low'
                  end
                ),
                true
              )
            end
          else channel.value
        end
        order by channel.ordinal
      ),
      '[]'::jsonb
    )
    from jsonb_array_elements(device_setup.setup_payload -> 'channels')
      with ordinality as channel(value, ordinal)
  )
)
where jsonb_typeof(device_setup.setup_payload -> 'channels') = 'array';

create or replace function public.device_setup_has_valid_channel_priorities(payload jsonb)
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
          channel.value ->> 'priority_status' not in ('low', 'high'),
          true
        )
    )
  end
$$;
