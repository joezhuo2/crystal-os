//! Kill-on-close Windows Job Object for Nebula child processes.
//!
//! Every process the harness spawns (node running dsh, its MCP servers, the
//! claude CLI) is assigned to one job. Closing the job handle, or Crystal OS
//! dying for any reason, terminates the whole tree. No breakaway flag is set,
//! so grandchildren cannot escape it.

#[cfg(windows)]
mod imp {
  use std::os::windows::io::AsRawHandle;
  use std::process::Child;

  use windows_sys::Win32::Foundation::{CloseHandle, HANDLE};
  use windows_sys::Win32::System::JobObjects::{
    AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation, SetInformationJobObject,
    TerminateJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
  };

  pub struct Job(HANDLE);

  // The handle is only used through the Win32 job APIs, which are thread-safe.
  unsafe impl Send for Job {}
  unsafe impl Sync for Job {}

  impl Job {
    pub fn new() -> Option<Job> {
      unsafe {
        let handle = CreateJobObjectW(std::ptr::null(), std::ptr::null());
        if handle.is_null() {
          return None;
        }
        let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
        info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        let ok = SetInformationJobObject(
          handle,
          JobObjectExtendedLimitInformation,
          &info as *const _ as *const core::ffi::c_void,
          std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
        );
        if ok == 0 {
          CloseHandle(handle);
          return None;
        }
        Some(Job(handle))
      }
    }

    /// False when Windows refuses the assignment; the caller then falls back to
    /// `taskkill /T` when killing.
    pub fn assign(&self, child: &Child) -> bool {
      unsafe { AssignProcessToJobObject(self.0, child.as_raw_handle() as HANDLE) != 0 }
    }

    pub fn terminate(&self) {
      unsafe {
        TerminateJobObject(self.0, 1);
      }
    }
  }

  impl Drop for Job {
    fn drop(&mut self) {
      unsafe {
        CloseHandle(self.0);
      }
    }
  }
}

#[cfg(not(windows))]
mod imp {
  use std::process::Child;

  /// Non-Windows builds rely on killing the direct child only.
  pub struct Job;

  impl Job {
    pub fn new() -> Option<Job> {
      Some(Job)
    }
    pub fn assign(&self, _child: &Child) -> bool {
      true
    }
    pub fn terminate(&self) {}
  }
}

pub use imp::Job;

/// Last resort for a child that could not be placed in a job.
pub fn kill_tree(pid: u32) {
  #[cfg(windows)]
  {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let _ = std::process::Command::new("taskkill")
      .args(["/T", "/F", "/PID", &pid.to_string()])
      .creation_flags(CREATE_NO_WINDOW)
      .status();
  }
  #[cfg(not(windows))]
  let _ = pid;
}

#[cfg(all(test, windows))]
mod tests {
  use super::*;
  use std::process::{Command, Stdio};
  use std::time::{Duration, Instant};

  fn alive(pid: u32) -> bool {
    let out = Command::new("tasklist").args(["/FI", &format!("PID eq {pid}"), "/NH"]).output().unwrap();
    String::from_utf8_lossy(&out.stdout).contains(&pid.to_string())
  }

  #[test]
  fn closing_the_job_kills_the_child_tree() {
    let job = Job::new().expect("job");
    // cmd waits on a long-lived grandchild (ping).
    let mut child = Command::new("cmd")
      .args(["/d", "/c", "ping -n 60 127.0.0.1 >nul"])
      .stdout(Stdio::null())
      .spawn()
      .unwrap();
    assert!(job.assign(&child));
    std::thread::sleep(Duration::from_millis(800));
    let pid = child.id();
    assert!(alive(pid));
    drop(job);
    let started = Instant::now();
    while alive(pid) && started.elapsed() < Duration::from_secs(5) {
      std::thread::sleep(Duration::from_millis(100));
    }
    assert!(!alive(pid));
    let _ = child.wait();
  }
}
