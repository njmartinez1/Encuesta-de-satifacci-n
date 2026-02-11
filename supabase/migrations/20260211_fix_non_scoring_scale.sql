do $$
declare
  q_id bigint;
  q_ids bigint[] := array[24, 25, 30, 31];
begin
  foreach q_id in array q_ids loop
    update public.evaluations
    set answers = jsonb_set(
      answers,
      array[q_id::text],
      to_jsonb(
        case answers->>q_id::text
          when '1' then -1
          when '2' then -0.75
          when '3' then 0.75
          when '4' then 1
        end
      ),
      true
    )
    where answers ? q_id::text
      and (answers->>q_id::text) in ('1','2','3','4');
  end loop;
end $$;
