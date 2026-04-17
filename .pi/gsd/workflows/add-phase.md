<gsd-version v="2.1.1" />

<gsd-arguments>
  <settings>
    <keep-extra-args />
  </settings>
  <arg name="description" type="string" optional />
</gsd-arguments>

<gsd-execute>
  <shell command="pi-gsd-tools">
    <args>
      <arg string="init" />
      <arg string="phase-op" />
      <arg string="0" />
    </args>
    <outs>
      <out type="string" name="init" />
    </outs>
  </shell>
  <if>
    <condition>
      <starts-with>
        <left name="init" />
        <right type="string" value="@file:" />
      </starts-with>
    </condition>
    <then>
      <string-op op="split">
        <args>
          <arg name="init" />
          <arg type="string" value="@file:" />
        </args>
        <outs>
          <out type="string" name="init-file" />
        </outs>
      </string-op>
      <shell command="cat">
        <args>
          <arg name="init-file" wrap='"' />
        </args>
        <outs>
          <out type="string" name="init" />
        </outs>
      </shell>
    </then>
  </if>
  <shell command="python3">
    <args>
      <arg string="scripts/gsd_phase_add_guard.py" />
      <arg name="description" wrap='"' />
    </args>
    <outs>
      <out type="string" name="phase-add-guard" />
    </outs>
  </shell>
  <if>
    <condition>
      <starts-with>
        <left name="phase-add-guard" />
        <right type="string" value="{&quot;allow&quot;: true" />
      </starts-with>
    </condition>
    <then>
      <shell command="pi-gsd-tools">
        <args>
          <arg string="phase" />
          <arg string="add-batch" />
          <arg name="description" wrap='"' />
        </args>
        <outs>
          <out type="string" name="batch-result" />
        </outs>
      </shell>
    </then>
    <else>
      <shell command="printf">
        <args>
          <arg string="%s" />
          <arg name="phase-add-guard" wrap='"' />
        </args>
        <outs>
          <out type="string" name="batch-result" />
        </outs>
      </shell>
    </else>
  </if>
</gsd-execute>

## Context (pre-injected by WXP)

**Init:**
<gsd-paste name="init" />

**Phases added:**
<gsd-paste name="batch-result" />

<process>

<step name="parse_arguments">
If no description was provided (check `<gsd-paste name="description" />` is empty):

```
ERROR: Phase description required
Usage: /gsd-add-phase <description>
       /gsd-add-phase <desc1> + <desc2> + ...
Example: /gsd-add-phase Add authentication system
```

Exit.
</step>

<step name="check_result">
Parse the `batch-result` JSON above:

- If `allow` is `false` and `reason` is `duplicate_phase_description` → do NOT add anything. Report that the request matched existing phase(s), list the matching phase numbers/names, and exit cleanly.
- If it contains an `error` field → report the error and exit.
- Otherwise extract `phases[]` — each has `phase_number`, `padded`, `name`,
  `slug`, `directory`.

Do NOT run `pi-gsd-tools phase add` again, do NOT inspect `.planning/phases/`
or ROADMAP.md — everything is already done.
</step>

<step name="completion">
Present a completion summary:

```
Added <count> phase(s):

<for each phase in phases[]>
• Phase <phase_number>: <name>
  Directory: <directory>
</for>

Roadmap updated: .planning/ROADMAP.md
State updated:   .planning/STATE.md

---

## ▶ Next Up

**Phase <last phase_number>: <last name>**

`/gsd-plan-phase <last phase_number>`

<sub>`/clear` first → fresh context window</sub>

---

**Also available:**
- `/gsd-add-phase <description>` — add another phase
- `/gsd-plan-phase <N>` — plan any of the new phases
```
</step>

</process>

<success_criteria>
- [ ] `pi-gsd-tools phase add-batch` executed by WXP (not by the agent)
- [ ] Phase directories created under `.planning/phases/`
- [ ] ROADMAP.md updated with all new phase entries
- [ ] STATE.md Roadmap Evolution updated (handled inside add-batch)
- [ ] Agent presented the pre-injected result — no filesystem exploration
</success_criteria>
